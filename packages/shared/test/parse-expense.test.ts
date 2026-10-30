import { describe, expect, it } from 'vitest';
import {
  describeParseError,
  looksLikeChat,
  parseExpenseLine,
  parseExpenseText,
  type LineResult,
} from '../src/parse-expense';

function expense(result: LineResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.expense;
}

describe('parseExpenseLine', () => {
  it('parses the basic "<merchant> <amount>" format', () => {
    expect(expense(parseExpenseLine('kopi 15k'))).toEqual({
      merchant: 'kopi',
      amount: 15_000,
      categoryTag: null,
      paymentMethod: null,
    });
  });

  it.each([
    ['makan siang 25000', 'makan siang', 25_000],
    ['grab 23.500', 'grab', 23_500],
    ['bensin 50 rb', 'bensin', 50_000],
    ['beli 2 kopi 30k', 'beli 2 kopi', 30_000],
    ['kopi rp 15.000', 'kopi', 15_000],
    ['kopi Rp15.000', 'kopi', 15_000],
    ['kopi 15.5k', 'kopi', 15_500],
    ['  servis   motor 1,2jt  ', 'servis motor', 1_200_000],
  ])('%j', (line, merchant, amount) => {
    expect(expense(parseExpenseLine(line))).toMatchObject({ merchant, amount });
  });

  it('reads #category and @method anywhere in the line', () => {
    expect(expense(parseExpenseLine('bensin 50rb #Transport @qris'))).toMatchObject({
      merchant: 'bensin',
      amount: 50_000,
      categoryTag: 'transport',
      paymentMethod: 'qris',
    });
    expect(expense(parseExpenseLine('#makan @gopay nasi padang 25k'))).toMatchObject({
      merchant: 'nasi padang',
      categoryTag: 'makan',
      paymentMethod: 'ewallet',
    });
  });

  it.each([
    ['tunai', 'cash'],
    ['tf', 'transfer'],
    ['debet', 'debit'],
    ['lainnya', 'other'],
  ])('maps @%s to %s', (alias, method) => {
    expect(expense(parseExpenseLine(`parkir 5rb @${alias}`)).paymentMethod).toBe(method);
  });

  it.each([
    ['kopi', 'missing_amount'],
    ['halo apa kabar', 'missing_amount'],
    ['kopi 15.5', 'invalid_amount'],
    ['kopi 1,5', 'invalid_amount'],
    ['15k', 'missing_merchant'],
    ['rp 15.000 @qris', 'missing_merchant'],
    ['123 15k', 'missing_merchant'],
    ['kopi 15k @bitcoin', 'unknown_payment_method'],
    ['kopi 15k #makan #minum', 'multiple_categories'],
    ['kopi 15k @qris @cash', 'multiple_payment_methods'],
  ])('%j → %s', (line, error) => {
    expect(parseExpenseLine(line)).toMatchObject({ ok: false, error });
  });

  it('has a message for every error', () => {
    expect(describeParseError('invalid_amount')).toContain('15k');
  });
});

describe('parseExpenseText', () => {
  it('parses one expense per non-empty line', () => {
    const results = parseExpenseText('kopi 15k\n\nparkir 5rb\r\nmakan siang 32.500 #makan\n');
    expect(results.map(expense).map((e) => [e.merchant, e.amount])).toEqual([
      ['kopi', 15_000],
      ['parkir', 5_000],
      ['makan siang', 32_500],
    ]);
  });

  it('keeps failures next to successes', () => {
    const results = parseExpenseText('kopi 15k\nkopi 15.5');
    expect(results.map((r) => r.ok)).toEqual([true, false]);
  });
});

describe('looksLikeChat', () => {
  it('is true only when no line contains an amount', () => {
    expect(looksLikeChat(parseExpenseText('halo\napa kabar'))).toBe(true);
    expect(looksLikeChat(parseExpenseText('halo\nkopi 15k'))).toBe(false);
    expect(looksLikeChat(parseExpenseText('kopi 15.5'))).toBe(false);
  });
});
