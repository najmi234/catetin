import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { Logger } from '../../logger';
import type { AppStateService } from '../../services/app-state';

const CURSOR_KEY = 'gmail.cursor';

export interface GmailCursor {
  /** UIDs are only meaningful within one UIDVALIDITY; a change means re-baselining. */
  uidValidity: string;
  lastUid: number;
}

export type CursorPlan =
  { action: 'baseline'; cursor: GmailCursor } | { action: 'fetch'; fromUid: number };

/**
 * Decide what to fetch. On first run (or after the mailbox was reset) start from the
 * newest message instead of importing the whole inbox history.
 */
export function planFetch(
  cursor: GmailCursor | null,
  mailbox: { uidValidity: string; uidNext: number },
): CursorPlan {
  if (!cursor || cursor.uidValidity !== mailbox.uidValidity) {
    return {
      action: 'baseline',
      cursor: { uidValidity: mailbox.uidValidity, lastUid: mailbox.uidNext - 1 },
    };
  }
  return { action: 'fetch', fromUid: cursor.lastUid + 1 };
}

export interface GmailPollerOptions {
  email: string;
  password: string;
  intervalMs: number;
  appState: AppStateService;
  logger: Logger;
  onEmail: (mail: ParsedMail, uid: number) => Promise<void>;
}

/** Connect → fetch new mail → disconnect, on an interval. The cursor lives in the database. */
export function startGmailPoller(options: GmailPollerOptions) {
  const log = options.logger.child({ module: 'gmail' });
  let running = false;

  async function pollOnce() {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: options.email, pass: options.password },
      logger: false,
    });
    client.on('error', (err) => log.warn({ err }, 'IMAP connection error'));

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
      const plan = planFetch(await options.appState.get<GmailCursor>(CURSOR_KEY), {
        uidValidity: String(mailbox.uidValidity),
        uidNext: mailbox.uidNext,
      });

      if (plan.action === 'baseline') {
        await options.appState.set(CURSOR_KEY, plan.cursor);
        log.info({ cursor: plan.cursor }, 'baseline set — only newer mail will be processed');
        return;
      }

      const messages: { uid: number; source: Buffer }[] = [];
      for await (const msg of client.fetch(
        `${plan.fromUid}:*`,
        { uid: true, source: true },
        { uid: true },
      )) {
        // "N:*" always returns the newest message, even when its UID is below N
        if (msg.uid >= plan.fromUid && msg.source)
          messages.push({ uid: msg.uid, source: msg.source });
      }
      messages.sort((a, b) => a.uid - b.uid);
      if (messages.length > 0) log.info({ count: messages.length }, 'new mail');

      for (const { uid, source } of messages) {
        try {
          await options.onEmail(await simpleParser(source), uid);
        } catch (err) {
          // Move on anyway: one broken email must not block the inbox forever
          log.error({ err, uid }, 'failed to process email');
        }
        await options.appState.set(CURSOR_KEY, {
          uidValidity: String(mailbox.uidValidity),
          lastUid: uid,
        } satisfies GmailCursor);
      }
    } catch (err) {
      log.error({ err }, 'poll failed');
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      await pollOnce();
    } finally {
      running = false;
    }
  }

  log.info({ intervalMs: options.intervalMs }, 'polling started');
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
