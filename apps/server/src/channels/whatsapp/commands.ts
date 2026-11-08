import {
  PAYMENT_METHOD_LABELS,
  currentYearMonth,
  formatMonthLabel,
  formatRupiah,
  looksLikeChat,
  parseAmount,
  parseExpenseText,
  toZonedParts,
} from '@catetin/shared';
import type { Services } from '../../services';
import type { PocketView } from '../../services/pockets';
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
  'Kantong: `servis 150rb $servis` (default: kantong milik kategorinya)',
  '',
  '*Kantong:*',
  '• `!kantong` — saldo semua kantong',
  '• `!isi <kantong> <nominal>` — isi saldo (contoh `!isi bensin 300rb`)',
  '• `!pindah <dari> <ke> <nominal>` — contoh `!pindah jajan bensin 50rb`',
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
  return formatQuickAdd(result, ctx);
}

async function runCommand(command: string, ctx: WhatsAppContext): Promise<string> {
  if (['!h', '!help', '!bantuan'].includes(command)) return HELP;
  if (['!m', '!bulan'].includes(command)) return monthSummary(ctx);
  if (command === '!undo') return undo(ctx);
  if (['!k', '!kantong'].includes(command)) return pocketList(ctx);

  const [name, ...args] = command.split(/\s+/);
  if (name === '!isi') return topUp(ctx, args);
  if (name === '!pindah') return transfer(ctx, args);

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

  return [
    `📊 *Pengeluaran Per Hari (${formatMonthLabel(month)})*`,
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

async function pocketList(ctx: WhatsAppContext): Promise<string> {
  const pockets = await ctx.services.pockets.list(ctx.userId);
  if (pockets.length === 0) return '💼 Belum ada kantong. Buat kantong di aplikasi Catetin.';
  const total = pockets.reduce((sum, p) => sum + p.balance, 0);
  return [
    '💼 *Saldo Kantong*',
    '',
    ...pockets.map((p) => `${p.balance < 0 ? '⚠️' : '•'} ${p.name}: ${formatRupiah(p.balance)}`),
    '',
    `💰 *Total: ${formatRupiah(total)}*`,
  ].join('\n');
}

async function findPocket(ctx: WhatsAppContext, tag: string): Promise<PocketView | string> {
  const pocket = await ctx.services.pockets.resolveTag(ctx.userId, tag);
  if (pocket) return pocket;
  const names = (await ctx.services.pockets.list(ctx.userId)).map((p) => p.name);
  return `❌ Kantong "${tag}" tidak ditemukan${names.length ? `. Kantong: ${names.join(', ')}` : ''}.`;
}

/** "!isi kos dan kuota 450rb" — the last word (or "50 rb") is the amount, the rest the pocket. */
async function topUp(ctx: WhatsAppContext, args: string[]): Promise<string> {
  const usage = 'Format: `!isi <kantong> <nominal>`, contoh `!isi bensin 300rb`';
  const split = splitAmount(args);
  if (!split || split.words.length === 0) return usage;

  const pocket = await findPocket(ctx, split.words.join(' '));
  if (typeof pocket === 'string') return pocket;
  const updated = await ctx.services.pockets.topUp(ctx.userId, pocket.id, {
    amount: split.amount,
    occurredAt: ctx.sentAt,
  });
  return `💼 *${pocket.name}* +${formatRupiah(split.amount)}\nSaldo: ${formatRupiah(updated!.balance)}`;
}

/** "!pindah jajan bensin 50rb" — pockets are single words (a name or its prefix). */
async function transfer(ctx: WhatsAppContext, args: string[]): Promise<string> {
  const usage = 'Format: `!pindah <dari> <ke> <nominal>`, contoh `!pindah jajan bensin 50rb`';
  const split = splitAmount(args);
  if (!split || split.words.length !== 2) return usage;

  const from = await findPocket(ctx, split.words[0]!);
  if (typeof from === 'string') return from;
  const to = await findPocket(ctx, split.words[1]!);
  if (typeof to === 'string') return to;
  if (from.id === to.id) return '❌ Kantong asal dan tujuan harus berbeda.';

  const result = await ctx.services.pockets.transfer(ctx.userId, {
    fromPocketId: from.id,
    toPocketId: to.id,
    amount: split.amount,
  });
  return [
    `🔁 *${formatRupiah(split.amount)}* dipindah`,
    '',
    `• ${result.from.name}: ${formatRupiah(result.from.balance)}`,
    `• ${result.to.name}: ${formatRupiah(result.to.balance)}`,
  ].join('\n');
}

/** Take the amount off the end of the words: ["kos", "450rb"] or ["bensin", "50", "rb"]. */
function splitAmount(args: string[]): { words: string[]; amount: number } | null {
  for (const take of [1, 2]) {
    if (args.length < take) break;
    const amount = parseAmount(args.slice(-take).join(' '));
    if (amount !== null) return { words: args.slice(0, -take), amount };
  }
  return null;
}

function describe(t: TransactionView): string {
  const extras = [
    t.category?.name,
    t.paymentMethod !== 'cash' ? PAYMENT_METHOD_LABELS[t.paymentMethod] : null,
  ].filter(Boolean);
  return `${t.merchant} — ${formatRupiah(t.amount)}${extras.length ? ` (${extras.join(', ')})` : ''}`;
}

async function formatQuickAdd(
  result: QuickAddResult,
  ctx: WhatsAppContext,
): Promise<string | null> {
  const { created, failed, unknownTags, unknownPockets, duplicates } = result;
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

  // Balance left in every pocket the new expenses were taken from
  const pocketIds = [...new Set(created.flatMap((t) => (t.pocket ? [t.pocket.id] : [])))];
  if (pocketIds.length > 0) {
    parts.push('');
    for (const id of pocketIds) {
      const pocket = await ctx.services.pockets.get(ctx.userId, id);
      if (!pocket) continue;
      parts.push(
        pocket.balance < 0
          ? `⚠️ Kantong ${pocket.name} minus: ${formatRupiah(pocket.balance)}`
          : `💼 Sisa ${pocket.name}: ${formatRupiah(pocket.balance)}`,
      );
    }
  }

  if (unknownTags.length > 0) {
    const tags = [...new Set(unknownTags)].map((t) => `#${t}`).join(', ');
    parts.push('', `⚠️ Kategori ${tags} tidak ditemukan — disimpan tanpa kategori.`);
  }
  if (unknownPockets.length > 0) {
    const tags = [...new Set(unknownPockets)].map((t) => `$${t}`).join(', ');
    parts.push('', `⚠️ Kantong ${tags} tidak ditemukan — memakai kantong kategorinya.`);
  }
  if (failed.length > 0) {
    parts.push('', ...failed.map((f) => `⚠️ "${f.line}": ${f.message}`));
  }
  if (created.length > 0) parts.push('', '_Salah catat? Ketik `!undo`_');
  return parts.join('\n');
}
