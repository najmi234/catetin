/** All day/month boundaries in the app are computed in WIB. */
export const APP_TIME_ZONE = 'Asia/Jakarta';

// WIB is a fixed UTC+7 with no daylight saving (none since 1964), so plain offset
// arithmetic is exact — and avoids depending on Intl time-zone support, which
// varies between JavaScript engines (Hermes on Android in particular).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface DateRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
}

/** "2026-07" → { year: 2026, month: 7 }, or null when malformed. */
export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The instant of 00:00 WIB on a calendar date. Overflow rolls over like Date (month 13 → January). */
export function wibMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - WIB_OFFSET_MS);
}

/** The instant of a WIB wall-clock time. */
export function fromWibParts(parts: Omit<ZonedParts, 'weekday'>): Date {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - WIB_OFFSET_MS,
  );
}

/** The instant range covering a whole WIB month. */
export function monthRange(ym: string): DateRange | null {
  const parsed = parseYearMonth(ym);
  if (!parsed) return null;
  return {
    start: wibMidnight(parsed.year, parsed.month, 1),
    end: wibMidnight(parsed.year, parsed.month + 1, 1),
  };
}

/** The instant range covering one WIB day, or null when the date does not exist (e.g. 31 Sept). */
export function dayRange(year: number, month: number, day: number): DateRange | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { start: wibMidnight(year, month, day), end: wibMidnight(year, month, day + 1) };
}

/** Calendar fields of an instant as seen in WIB. */
export function toZonedParts(date: Date): ZonedParts {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** "YYYY-MM" of the WIB month containing `now`. */
export function currentYearMonth(now: Date = new Date()): string {
  const { year, month } = toZonedParts(now);
  return formatYearMonth(year, month);
}

/** "2026-01" shifted by -1 → "2025-12". */
export function shiftYearMonth(ym: string, delta: number): string {
  const parsed = parseYearMonth(ym);
  if (!parsed) throw new Error(`Bulan tidak valid: ${ym}`);
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return formatYearMonth(Math.floor(index / 12), (index % 12) + 1);
}

// ── Indonesian display helpers (no Intl, so output is identical everywhere) ──

export const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const WEEKDAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10" → "Oktober 2026" */
export function formatMonthLabel(ym: string): string {
  const parsed = parseYearMonth(ym);
  if (!parsed) return ym;
  return `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/** "Jumat, 30 Okt" */
export function formatDayLabel(date: Date): string {
  const p = toZonedParts(date);
  return `${WEEKDAY_NAMES[p.weekday]}, ${p.day} ${MONTH_NAMES[p.month - 1]!.slice(0, 3)}`;
}

/** "30 Okt 2026" */
export function formatDate(date: Date): string {
  const p = toZonedParts(date);
  return `${p.day} ${MONTH_NAMES[p.month - 1]!.slice(0, 3)} ${p.year}`;
}

/** "14:05" (WIB) */
export function formatTime(date: Date): string {
  const p = toZonedParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
