import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import type { Logger } from '../../logger';

export interface WhatsAppOptions {
  authDir: string;
  /** Prefer the LID: Baileys fires separate events for @lid and @s.whatsapp.net. */
  myLid?: string;
  myPhone?: string;
  logger: Logger;
  /** Handle a self-chat text; a returned string is sent back as the reply. */
  onText: (text: string, message: { id: string; sentAt: Date }) => Promise<string | null>;
}

export interface WhatsAppHandle {
  /** Send a message to the self-chat; dropped (with a log line) while disconnected. */
  notify: (text: string) => Promise<void>;
  stop: () => Promise<void>;
}

const MAX_BACKOFF_MS = 60_000;
const REMEMBERED_IDS = 500;

/** A Set that forgets its oldest entries. */
class RecentIds {
  private readonly ids = new Set<string>();
  add(id: string) {
    this.ids.add(id);
    if (this.ids.size > REMEMBERED_IDS) this.ids.delete(this.ids.values().next().value!);
  }
  has(id: string) {
    return this.ids.has(id);
  }
}

export function startWhatsApp(options: WhatsAppOptions): WhatsAppHandle {
  const log = options.logger.child({ module: 'whatsapp' });
  let sock: WASocket | null = null;
  let connected = false;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | undefined;

  const handled = new RecentIds();
  // The bot's own replies land in the same self-chat; never treat them as input
  const sentByBot = new RecentIds();

  function selfJid(): string | null {
    if (options.myLid) return `${options.myLid}@lid`;
    if (options.myPhone) return `${options.myPhone}@s.whatsapp.net`;
    return sock?.user?.id?.replace(/:.*@/, '@') ?? null;
  }

  async function send(text: string) {
    const jid = selfJid();
    if (!sock || !connected || !jid) {
      log.warn('not connected — message not sent');
      return;
    }
    const sent = await sock.sendMessage(jid, { text });
    if (sent?.key.id) sentByBot.add(sent.key.id);
  }

  async function onMessage(msg: WAMessage) {
    const id = msg.key.id;
    if (!id || !msg.key.fromMe || msg.key.remoteJid !== selfJid()) return;
    if (handled.has(id) || sentByBot.has(id)) return;
    handled.add(id);

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (!text) return;

    const sentAt = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();
    try {
      const reply = await options.onText(text, { id, sentAt });
      if (reply) await send(reply);
    } catch (err) {
      log.error({ err }, 'failed to handle message');
      await send('❌ Gagal memproses pesan. Coba lagi.').catch(() => {});
    }
  }

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(options.authDir);

    let version: [number, number, number] | undefined;
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch (err) {
      log.warn({ err }, 'could not fetch the latest WhatsApp Web version; using the default');
    }

    const socket = makeWASocket({
      ...(version && { version }),
      auth: state,
      logger: log.child({ module: 'baileys' }, { level: 'error' }),
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    sock = socket;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrcode.generate(qr, { small: true });
        log.info('scan the QR code above with WhatsApp (Linked devices)');
      }

      if (connection === 'open') {
        connected = true;
        attempt = 0;
        log.info({ selfJid: selfJid() }, 'connected');
      }

      if (connection === 'close') {
        connected = false;
        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        if (stopped) return;
        if (status === DisconnectReason.loggedOut) {
          log.error(`logged out — delete ${options.authDir} and restart to scan a new QR code`);
          return;
        }
        attempt++;
        const delay = Math.min(attempt * 3_000, MAX_BACKOFF_MS);
        log.warn({ status, attempt, delayMs: delay }, 'connection closed — reconnecting');
        reconnectTimer = setTimeout(() => {
          connect().catch((err) => log.error({ err }, 'reconnect failed'));
        }, delay);
      }
    });

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) void onMessage(msg);
    });
  }

  connect().catch((err) => log.error({ err }, 'could not start WhatsApp'));

  return {
    notify: (text) => send(text).catch((err) => log.error({ err }, 'notify failed')),
    async stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      sock?.end(undefined);
    },
  };
}
