const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
};

/** Optional "Rp" prefix, a number, and an optional k/rb/ribu/jt/juta suffix. */
export const AMOUNT_PATTERN = String.raw`(?:rp\.?\s*)?\d[\d.,]*(?:\s*(?:k|rb|ribu|jt|juta))?`;

const AMOUNT_RE = /^(?:rp\.?\s*)?(\d[\d.,]*)\s*(k|rb|ribu|jt|juta)?$/i;

/**
 * Parse a rupiah amount as typed by a person or printed by a bank.
 *
 *   "15000", "15.000", "Rp 43.000,00", "15k", "15.5k", "1,5rb", "1.2jt", "50 ribu"
 *
 * Returns a positive integer, or null when the input is not an amount.
 */
export function parseAmount(raw: string): number | null {
  const match = AMOUNT_RE.exec(raw.trim());
  if (!match) return null;

  const numberPart = match[1]!;
  const suffix = match[2]?.toLowerCase();
  const value = suffix ? parseScaledNumber(numberPart) : parsePlainNumber(numberPart);
  if (value === null) return null;

  const amount = Math.round(value * (suffix ? MULTIPLIERS[suffix]! : 1));
  return amount > 0 && Number.isSafeInteger(amount) ? amount : null;
}

// With a k/rb/jt suffix, a single "." or "," is a decimal point: "15.5k", "1,5rb".
function parseScaledNumber(s: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

// Indonesian notation: "." groups thousands, "," starts decimals ("43.000,00").
function parsePlainNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);

  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(s);
  if (grouped)
    return Number(grouped[1]!.replaceAll('.', '') + (grouped[2] ? `.${grouped[2]}` : ''));

  // "15000,00" — decimals only make sense after a real rupiah amount, so "1,5" is rejected
  const ungrouped = /^(\d{4,}),(\d{1,2})$/.exec(s);
  if (ungrouped) return Number(`${ungrouped[1]}.${ungrouped[2]}`);

  // "15,000" — English-style grouping
  if (/^\d{1,3}(?:,\d{3})+$/.test(s)) return Number(s.replaceAll(',', ''));

  return null;
}

const rupiahFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** 15000 → "Rp 15.000", -20000 → "-Rp 20.000" */
export function formatRupiah(amount: number): string {
  return amount < 0 ? `-Rp ${rupiahFormat.format(-amount)}` : `Rp ${rupiahFormat.format(amount)}`;
}
