import {
  PAYMENT_METHOD_LABELS,
  currentYearMonth,
  formatRupiah,
  looksLikeChat,
  parseExpenseText,
  toZonedParts,
} from '@catetin/shared';
import type { Services } from '../../services';
import type { QuickAddResult, TransactionView } from '../../services/transactions';

export interface WhatsAppContext {
  userId: string;
  services: Services;
  /** WhatsApp message id — makes a redelivered message idempotent. */
  messageId: string;
  /** When the message was sent; becomes the transaction time. */
  sentAt: Date;
}

const HELP = [
  '📝 *Catetin — Bantuan*',
  '',
  '*Mencatat* (satu pengeluaran per baris):',
  '`kopi 15k`',
  '`bensin 50rb #transport`',
  '`makan siang 32.500 #makan @qris`',
  '',
  'Nominal: `15000`, `15.000`, `15k`, `15.5k`, `1,5rb`, `1jt`',
  'Metode: `@cash` (default), `@qris`, `@debit`, `@ewallet`, `@transfer`',
  '',
  '*Perintah:*',
  '• `!t` — pengeluaran hari ini',
  '• `!t<tgl>` — tanggal tertentu bulan ini (contoh `!t9`)',
  '• `!m` — rekap bulan ini per hari',
  '• `!undo` — hapus catatan WA terakhir',
  '• `!help` — bantuan ini',
].join('\n');

/**
 * Turn one self-chat message into a reply. Returns null when the bot should stay
 * silent (ordinary chat, or a redelivered message that was already recorded).
 */
export async function handleWhatsAppText(
  rawText: string,
  ctx: WhatsAppContext,
): Promise<string | null> {
  const text = rawText.trim();
  if (!text) return null;

  if (text.startsWith('!')) return runCommand(text.toLowerCase(), ctx);
  if (looksLikeChat(parseExpenseText(text))) return null;

  const result = await ctx.services.transactions.quickAdd(ctx.userId, text, {
    channel: 'whatsapp',
    occurredAt: ctx.sentAt,
    externalIdPrefix: `wa:${ctx.messageId}`,
  });
  return formatQuickAdd(result);
}

async function runCommand(command: string, ctx: WhatsAppContext): Promise<string> {
  if (['!h', '!help', '!bantuan'].includes(command)) return HELP;
  if (['!m', '!bulan'].includes(command)) return monthSummary(ctx);
  if (command === '!undo') return undo(ctx);

  const day = /^!t(\d{1,2})?$/.exec(command);
  if (day) return daySummary(ctx, day[1] ? Number(day[1]) : null);

  return 'Perintah tidak dikenal. Ketik `!help` untuk bantuan.';
}

async function daySummary(ctx: WhatsAppContext, requestedDay: number | null): Promise<string> {
  const today = toZonedParts(ctx.sentAt);
  const day = requestedDay ?? today.day;
  const rows = await ctx.services.transactions.listDay(ctx.userId, { ...today, day });
  if (!rows) return `❌ Tanggal ${day} tidak ada di bulan ini.`;

  const title =
    requestedDay === null
      ? 'Pengeluaran Hari Ini'
      : `Pengeluaran Tgl ${day}/${today.month}/${today.year}`;
  if (rows.length === 0) return `📊 Belum ada catatan untuk ${title.toLowerCase()}.`;

  const lines = rows.map((t, i) => `${i + 1}. ${describe(t)}`);
  const total = rows.reduce((sum, t) => sum + t.amount, 0);
  return [`📊 *${title}*`, '', ...lines, '', `💰 *Total: ${formatRupiah(total)}*`].join('\n');
}

async function monthSummary(ctx: WhatsAppContext): Promise<string> {
  const month = currentYearMonth(ctx.sentAt);
  const summary = await ctx.services.summary.month(ctx.userId, month);
  if (summary.count === 0) return '📊 Belum ada pengeluaran di bulan ini.';

  const monthName = ctx.sentAt.toLocaleString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
  return [
    `📊 *Pengeluaran Per Hari (${monthName})*`,
    '',
    ...summary.daily.map((d) => `• Tgl ${d.day}: ${formatRupiah(d.total)}`),
    '',
    `💰 *Total: ${formatRupiah(summary.total)}*`,
    `📈 Rata-rata: ${formatRupiah(summary.averagePerActiveDay)} / hari aktif`,
    '',
    '_Ketik `!t<tanggal>` untuk rincian, contoh `!t9`_',
  ].join('\n');
}

async function undo(ctx: WhatsAppContext): Promise<string> {
  const removed = await ctx.services.transactions.removeLast(ctx.userId, 'whatsapp');
  if (!removed) return 'Tidak ada catatan WhatsApp yang bisa dihapus.';
  return `🗑️ Dihapus: ${describe(removed)}`;
}

function describe(t: TransactionView): string {
  const extras = [
    t.category?.name,
    t.paymentMethod !== 'cash' ? PAYMENT_METHOD_LABELS[t.paymentMethod] : null,
  ].filter(Boolean);
  return `${t.merchant} — ${formatRupiah(t.amount)}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

function formatQuickAdd(result: QuickAddResult): string | null {
  const { created, failed, unknownTags, duplicates } = result;
  if (created.length === 0 && failed.length === 0 && duplicates > 0) return null;

  const parts: string[] = [];
  if (created.length > 0) {
    parts.push(created.length === 1 ? '✅ *Tercatat*' : `✅ *Tercatat ${created.length} item*`);
    parts.push('', ...created.map((t) => `📌 ${describe(t)}`));
    if (created.length > 1) {
      const total = created.reduce((sum, t) => sum + t.amount, 0);
      parts.push('', `💰 Total: ${formatRupiah(total)}`);
    }
  } else {
    parts.push('❌ *Tidak ada yang tercatat*');
  }

  if (unknownTags.length > 0) {
    const tags = [...new Set(unknownTags)].map((t) => `#${t}`).join(', ');
    parts.push('', `⚠️ Kategori ${tags} tidak ditemukan — disimpan tanpa kategori.`);
  }
  if (failed.length > 0) {
    parts.push('', ...failed.map((f) => `⚠️ "${f.line}": ${f.message}`));
  }
  if (created.length > 0) parts.push('', '_Salah catat? Ketik `!undo`_');
  return parts.join('\n');
}
