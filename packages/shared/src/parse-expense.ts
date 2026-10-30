import { AMOUNT_PATTERN, parseAmount } from './money';
import type { PaymentMethod } from './schemas';

export interface ParsedExpense {
  merchant: string;
  amount: number;
  /** Lowercased tag without "#", resolved to a category by the server. */
  categoryTag: string | null;
  /** null when the line has no "@method"; the caller picks the default. */
  paymentMethod: PaymentMethod | null;
}

export type ParseError =
  | 'missing_amount'
  | 'invalid_amount'
  | 'missing_merchant'
  | 'unknown_payment_method'
  | 'multiple_categories'
  | 'multiple_payment_methods';

export type LineResult =
  | { ok: true; line: string; expense: ParsedExpense }
  | { ok: false; line: string; error: ParseError };

const PAYMENT_ALIASES: Record<string, PaymentMethod> = {
  cash: 'cash',
  tunai: 'cash',
  qris: 'qris',
  qr: 'qris',
  debit: 'debit',
  debet: 'debit',
  kartu: 'debit',
  atm: 'debit',
  ewallet: 'ewallet',
  gopay: 'ewallet',
  ovo: 'ewallet',
  dana: 'ewallet',
  shopeepay: 'ewallet',
  transfer: 'transfer',
  tf: 'transfer',
  trf: 'transfer',
  lainnya: 'other',
  other: 'other',
};

const LINE_RE = new RegExp(String.raw`^(.*\S)\s+(${AMOUNT_PATTERN})$`, 'i');

/**
 * Parse one expense line: "<merchant> <amount> [#category] [@method]".
 * Tags may appear anywhere in the line.
 *
 *   "kopi 15k"                  → kopi, 15.000
 *   "bensin 50rb #transport"    → bensin, 50.000, tag "transport"
 *   "makan siang 32.500 @qris"  → makan siang, 32.500, qris
 */
export function parseExpenseLine(input: string): LineResult {
  const line = input.trim();
  const fail = (error: ParseError): LineResult => ({ ok: false, line, error });

  const words: string[] = [];
  const categoryTags: string[] = [];
  const methodTags: string[] = [];
  for (const token of line.split(/\s+/)) {
    if (token.length > 1 && token.startsWith('#')) categoryTags.push(token.slice(1).toLowerCase());
    else if (token.length > 1 && token.startsWith('@'))
      methodTags.push(token.slice(1).toLowerCase());
    else words.push(token);
  }

  if (categoryTags.length > 1) return fail('multiple_categories');
  if (methodTags.length > 1) return fail('multiple_payment_methods');

  let paymentMethod: PaymentMethod | null = null;
  if (methodTags[0] !== undefined) {
    paymentMethod = PAYMENT_ALIASES[methodTags[0]] ?? null;
    if (!paymentMethod) return fail('unknown_payment_method');
  }

  const rest = words.join(' ');
  const match = LINE_RE.exec(rest);
  if (!match) {
    if (parseAmount(rest) !== null) return fail('missing_merchant');
    return fail(/\d/.test(words.at(-1) ?? '') ? 'invalid_amount' : 'missing_amount');
  }

  const amount = parseAmount(match[2]!);
  if (amount === null) return fail('invalid_amount');

  // "kopi rp 15.000": the greedy merchant group swallows the "rp" prefix
  const merchant = match[1]!.replace(/(?:^|\s+)rp\.?$/i, '').trim();
  if (!/\p{L}/u.test(merchant)) return fail('missing_merchant');

  return {
    ok: true,
    line,
    expense: { merchant, amount, categoryTag: categoryTags[0] ?? null, paymentMethod },
  };
}

/** Parse every non-empty line of a message. */
export function parseExpenseText(text: string): LineResult[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseExpenseLine);
}

/**
 * True when no line even looks like an expense — e.g. ordinary chat in WhatsApp,
 * which the bot should ignore instead of answering with an error.
 */
export function looksLikeChat(results: LineResult[]): boolean {
  return results.every((r) => !r.ok && r.error === 'missing_amount');
}

const ERROR_MESSAGES: Record<ParseError, string> = {
  missing_amount: 'Nominal tidak ditemukan. Format: <keterangan> <nominal>, contoh "kopi 15k".',
  invalid_amount:
    'Nominal tidak dikenali. Contoh yang valid: 15000, 15.000, 15k, 15.5k, 1,5rb, 1jt.',
  missing_merchant: 'Keterangan tidak ditemukan. Contoh: "kopi 15k".',
  unknown_payment_method:
    'Metode bayar tidak dikenali. Gunakan @cash, @qris, @debit, @ewallet, @transfer, atau @lainnya.',
  multiple_categories: 'Gunakan satu #kategori saja per baris.',
  multiple_payment_methods: 'Gunakan satu @metode saja per baris.',
};

export function describeParseError(error: ParseError): string {
  return ERROR_MESSAGES[error];
}
