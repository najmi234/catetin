import { TZDate } from '@date-fns/tz';

/** All day/month boundaries in the app are computed in WIB. */
export const APP_TIME_ZONE = 'Asia/Jakarta';

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

function wibMidnight(year: number, month: number, day: number): Date {
  // Month/day overflow rolls over like Date (month 13 → January next year).
  return new Date(new TZDate(year, month - 1, day, APP_TIME_ZONE).getTime());
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
  const zoned = new TZDate(date.getTime(), APP_TIME_ZONE);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
  };
}

/** "YYYY-MM" of the WIB month containing `now`. */
export function currentYearMonth(now: Date = new Date()): string {
  const { year, month } = toZonedParts(now);
  return formatYearMonth(year, month);
}
