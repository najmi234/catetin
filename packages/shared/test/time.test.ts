import { describe, expect, it } from 'vitest';
import {
  currentYearMonth,
  dayRange,
  daysInMonth,
  monthRange,
  parseYearMonth,
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
    // 18:30 UTC on 31 Oct is already 1 Nov in Jakarta
    const instant = new Date('2026-10-31T18:30:00.000Z');
    expect(toZonedParts(instant)).toEqual({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
    expect(currentYearMonth(instant)).toBe('2026-11');
  });
});
