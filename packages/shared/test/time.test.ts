import { describe, expect, it } from 'vitest';
import {
  currentYearMonth,
  dayRange,
  daysInMonth,
  formatDate,
  formatDayLabel,
  formatMonthLabel,
  formatTime,
  fromWibParts,
  monthRange,
  parseYearMonth,
  shiftYearMonth,
  toZonedParts,
} from '../src/time';

describe('parseYearMonth', () => {
  it('accepts YYYY-MM only', () => {
    expect(parseYearMonth('2026-07')).toEqual({ year: 2026, month: 7 });
    expect(parseYearMonth('2026-7')).toBeNull();
    expect(parseYearMonth('2026-13')).toBeNull();
    expect(parseYearMonth('2026-00')).toBeNull();
  });
});

describe('monthRange', () => {
  it('starts at WIB midnight (17:00 UTC the day before)', () => {
    expect(monthRange('2026-07')).toEqual({
      start: new Date('2026-06-30T17:00:00.000Z'),
      end: new Date('2026-07-31T17:00:00.000Z'),
    });
  });

  it('rolls December over to the next year', () => {
    expect(monthRange('2026-12')?.end).toEqual(new Date('2026-12-31T17:00:00.000Z'));
  });

  it('rejects malformed input', () => {
    expect(monthRange('juli')).toBeNull();
  });
});

describe('dayRange', () => {
  it('covers one WIB day', () => {
    expect(dayRange(2026, 10, 30)).toEqual({
      start: new Date('2026-10-29T17:00:00.000Z'),
      end: new Date('2026-10-30T17:00:00.000Z'),
    });
  });

  // The old bot built "!t31" in a 30-day month with Date.UTC, silently landing on the 1st.
  it('rejects days that do not exist', () => {
    expect(dayRange(2026, 9, 31)).toBeNull();
    expect(dayRange(2026, 2, 29)).toBeNull();
    expect(dayRange(2028, 2, 29)).not.toBeNull();
    expect(dayRange(2026, 1, 0)).toBeNull();
  });
});

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 9)).toBe(30);
  });
});

describe('toZonedParts / currentYearMonth', () => {
  it('reads calendar fields in WIB', () => {
    // 18:30 UTC on 31 Oct is already Sunday 1 Nov in Jakarta
    const instant = new Date('2026-10-31T18:30:00.000Z');
    expect(toZonedParts(instant)).toEqual({
      year: 2026,
      month: 11,
      day: 1,
      weekday: 0,
      hour: 1,
      minute: 30,
    });
    expect(currentYearMonth(instant)).toBe('2026-11');
  });

  it('matches the platform time-zone database', () => {
    const instant = new Date('2026-03-15T20:45:00.000Z');
    const intl = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
    const p = toZonedParts(instant);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(intl).toBe(`${p.year}-${pad(p.month)}-${pad(p.day)}, ${pad(p.hour)}:${pad(p.minute)}`);
  });

  it('round-trips through fromWibParts', () => {
    const instant = new Date('2026-07-10T03:05:00.000Z');
    expect(fromWibParts(toZonedParts(instant))).toEqual(instant);
  });
});

describe('shiftYearMonth', () => {
  it('crosses year boundaries', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2026-05', -17)).toBe('2024-12');
  });
});

describe('display helpers', () => {
  const instant = new Date('2026-10-30T07:05:00.000Z'); // Jumat 30 Okt 2026, 14:05 WIB
  it('formats in Indonesian, in WIB', () => {
    expect(formatMonthLabel('2026-10')).toBe('Oktober 2026');
    expect(formatDayLabel(instant)).toBe('Jumat, 30 Okt');
    expect(formatDate(instant)).toBe('30 Okt 2026');
    expect(formatTime(instant)).toBe('14:05');
  });
});
