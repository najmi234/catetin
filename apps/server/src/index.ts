import { serve } from '@hono/node-server';
import { createApp } from './api';
import { createAuth, sessionUserId } from './auth';
import { startGmailPoller } from './channels/gmail/poller';
import { processEmail } from './channels/gmail/process';
import { handleWhatsAppText } from './channels/whatsapp/commands';
import { startWhatsApp, type WhatsAppHandle } from './channels/whatsapp/connection';
import { loadConfig } from './config';
import { connectDb } from './db/client';
import { logger } from './logger';
import { createOtpSender } from './mailer';
import { createServices } from './services';

const config = loadConfig();
logger.level = config.LOG_LEVEL;

const { db, close: closeDb } = await connectDb(config.DATABASE_URL);
const services = createServices(db);
const ownerId = await services.ensureOwner(config.OWNER_EMAIL, config.OWNER_NAME);

const auth = createAuth({
  db,
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  trustedOrigins: config.TRUSTED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  ownerEmail: config.OWNER_EMAIL,
  sendOtp: createOtpSender(
    {
      email: config.EMAIL,
      password: config.EMAIL_PASSWORD,
      isProduction: config.NODE_ENV === 'production',
    },
    logger,
  ),
  logger,
});

const app = createApp({
  db,
  services,
  logger,
  getUserId: (request) => sessionUserId(auth, request),
  authHandler: (request) => auth.handler(request),
});

const server = serve({ fetch: app.fetch, hostname: config.HOST, port: config.PORT }, (info) =>
  logger.info(`API listening on http://${info.address}:${info.port}`),
);

let whatsapp: WhatsAppHandle | null = null;
if (config.WA_ENABLED) {
  whatsapp = startWhatsApp({
    authDir: config.WA_AUTH_DIR,
    myLid: config.MY_LID,
    myPhone: config.MY_PHONE,
    logger,
    onText: (text, message) =>
      handleWhatsAppText(text, {
        userId: ownerId,
        services,
        messageId: message.id,
        sentAt: message.sentAt,
      }),
  });
}

const notify = async (text: string) => {
  if (whatsapp) await whatsapp.notify(text);
  else logger.info({ text }, 'notification (WhatsApp disabled)');
};

const gmail = config.GMAIL_ENABLED
  ? startGmailPoller({
      email: config.EMAIL!,
      password: config.EMAIL_PASSWORD!,
      intervalMs: config.GMAIL_POLL_INTERVAL_MS,
      appState: services.appState,
      logger,
      onEmail: async (mail, uid) => {
        await processEmail(mail, { userId: ownerId, services, notify, logger }, `uid-${uid}`);
      },
    })
  : null;

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  gmail?.stop();
  await whatsapp?.stop();
  server.close();
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
