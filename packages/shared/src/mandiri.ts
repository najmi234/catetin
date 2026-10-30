import { parseAmount } from './money';
import type { PaymentMethod } from './schemas';

/** The parts of a parsed email (mailparser `simpleParser` output) the parser needs. */
export interface EmailInput {
  fromAddress?: string | null;
  fromName?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | false | null;
}

export type MandiriSkipReason = 'empty' | 'failed_transaction' | 'transfer' | 'unrecognized';

export type MandiriParseResult =
  | { ok: true; merchant: string; amount: number; paymentMethod: PaymentMethod }
  | { ok: false; reason: MandiriSkipReason };

const MANDIRI_DOMAIN = '@bankmandiri.co.id';

const FAILED_SUBJECT = ['tidak berhasil', 'gagal', 'failed', 'declined'];
const FAILED_BODY = ['transaksi gagal', 'pembayaran tidak berhasil', 'tidak dapat diproses'];

// Transfers and top-ups move money between accounts — they are not spending.
const TRANSFER_SUBJECT = ['transfer', 'top up', 'topup'];
const TRANSFER_BODY = [
  'nominal transfer',
  'jumlah transfer',
  'transfer berhasil',
  'biaya transfer',
  'transfer dengan bi fast',
  'transfer antar bank',
  'transfer ke rekening',
];

export function isMandiriEmail(email: EmailInput): boolean {
  const address = (email.fromAddress ?? '').toLowerCase();
  const name = (email.fromName ?? '').toLowerCase();
  return address.endsWith(MANDIRI_DOMAIN) || name.includes('mandiri');
}

/** Parse a Livin' by Mandiri payment notification. */
export function parseMandiriEmail(email: EmailInput): MandiriParseResult {
  const text = email.text || (email.html ? htmlToText(email.html) : '');
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, reason: 'empty' };

  const blob = lines.join('\n');
  const subject = (email.subject ?? '').toLowerCase();
  const body = blob.toLowerCase();

  if (
    FAILED_SUBJECT.some((s) => subject.includes(s)) ||
    FAILED_BODY.some((s) => body.includes(s))
  ) {
    return { ok: false, reason: 'failed_transaction' };
  }
  if (
    TRANSFER_SUBJECT.some((s) => subject.includes(s)) ||
    TRANSFER_BODY.some((s) => body.includes(s))
  ) {
    return { ok: false, reason: 'transfer' };
  }

  const merchant = extract(blob, /Penerima\s*[\n:]\s*(.+)/i);
  const amountRaw = extract(blob, /Nominal Transaksi\s*[\n:]\s*(.+)/i);
  const amount = amountRaw ? parseAmount(amountRaw) : null;
  if (!merchant || amount === null) return { ok: false, reason: 'unrecognized' };

  return { ok: true, merchant, amount, paymentMethod: /QRIS/i.test(blob) ? 'qris' : 'debit' };
}

function extract(text: string, regex: RegExp): string | null {
  return regex.exec(text)?.[1]?.trim() || null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|td|th|table|tbody|thead|li|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8203;|&#x200b;/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\r\n/g, '\n');
}
