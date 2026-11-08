import { describe, expect, it } from 'vitest';
import { formatRupiah, parseAmount } from '../src/money';

describe('parseAmount', () => {
  it.each([
    ['15000', 15_000],
    ['15.000', 15_000],
    ['23.500', 23_500],
    ['1.250.000', 1_250_000],
    ['Rp 43.000,00', 43_000],
    ['Rp43.000', 43_000],
    ['rp. 5.000', 5_000],
    ['15000,00', 15_000],
    ['15,000', 15_000],
    ['15k', 15_000],
    ['15K', 15_000],
    ['50rb', 50_000],
    ['50 rb', 50_000],
    ['50ribu', 50_000],
    ['1jt', 1_000_000],
    ['2 juta', 2_000_000],
  ])('%s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  // The old recorder stripped every "." before applying the suffix: "15.5k" became 155.000.
  it.each([
    ['15.5k', 15_500],
    ['15,5k', 15_500],
    ['1,5rb', 1_500],
    ['1.2jt', 1_200_000],
    ['2,75jt', 2_750_000],
    ['0.5k', 500],
  ])('decimal with suffix: %s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '0',
    '0k',
    '15.5', // not a valid thousands group, and no suffix to make it a decimal
    '1,5', // ambiguous without a suffix
    '15.00.0',
    '1.2.3k',
    '15kk',
    '-5000',
    '15x',
  ])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('formatRupiah', () => {
  it('uses Indonesian grouping', () => {
    expect(formatRupiah(15_000)).toBe('Rp 15.000');
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000');
    expect(formatRupiah(500)).toBe('Rp 500');
    expect(formatRupiah(-20_000)).toBe('-Rp 20.000');
  });
});
