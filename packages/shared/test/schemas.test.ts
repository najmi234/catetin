import { describe, expect, it } from 'vitest';
import {
  transactionCreateSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from '../src/schemas';

describe('transactionCreateSchema', () => {
  it('defaults the payment method to cash', () => {
    expect(transactionCreateSchema.parse({ merchant: ' kopi ', amount: 15_000 })).toEqual({
      merchant: 'kopi',
      amount: 15_000,
      paymentMethod: 'cash',
    });
  });

  it.each([0, -1, 1.5])('rejects amount %d', (amount) => {
    expect(transactionCreateSchema.safeParse({ merchant: 'kopi', amount }).success).toBe(false);
  });

  it('requires a timezone offset on occurredAt', () => {
    const base = { merchant: 'kopi', amount: 1 };
    expect(
      transactionCreateSchema.safeParse({ ...base, occurredAt: '2026-10-30T08:00:00+07:00' })
        .success,
    ).toBe(true);
    expect(
      transactionCreateSchema.safeParse({ ...base, occurredAt: '2026-10-30T08:00:00' }).success,
    ).toBe(false);
  });
});

describe('transactionUpdateSchema', () => {
  it('does not inject defaults into partial updates', () => {
    expect(transactionUpdateSchema.parse({ amount: 20_000 })).toEqual({ amount: 20_000 });
  });

  it('rejects an empty update', () => {
    expect(transactionUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('transactionListQuerySchema', () => {
  it('validates the month', () => {
    expect(transactionListQuerySchema.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(transactionListQuerySchema.safeParse({ month: '2026-1' }).success).toBe(false);
  });
});
