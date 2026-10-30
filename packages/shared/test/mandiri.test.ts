import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMandiriEmail, parseMandiriEmail } from '../src/mandiri';

const qrisHtml = readFileSync(new URL('./fixtures/mandiri-qris.html', import.meta.url), 'utf8');

const plainPayment = [
  'Pembayaran Berhasil',
  'Penerima',
  'WARUNG BU SRI',
  'Nominal Transaksi',
  'Rp 25.500,00',
  'Sumber Dana',
  'Tabungan Mandiri',
].join('\n');

describe('isMandiriEmail', () => {
  it('trusts the bankmandiri.co.id domain or a Mandiri sender name', () => {
    expect(isMandiriEmail({ fromAddress: 'noreply.livin@bankmandiri.co.id' })).toBe(true);
    expect(isMandiriEmail({ fromAddress: 'x@example.com', fromName: "Livin' by Mandiri" })).toBe(
      true,
    );
  });

  it('ignores other senders, even with a payment-like subject', () => {
    expect(
      isMandiriEmail({ fromAddress: 'promo@shop.example', subject: 'Pembayaran Berhasil' }),
    ).toBe(false);
  });
});

describe('parseMandiriEmail', () => {
  it('parses a QRIS payment from HTML', () => {
    expect(parseMandiriEmail({ subject: 'Pembayaran Berhasil', html: qrisHtml })).toEqual({
      ok: true,
      merchant: 'KOPI KENANGAN - GRAND INDONESIA',
      amount: 43_000,
      paymentMethod: 'qris',
    });
  });

  it('parses plain text and marks non-QRIS payments as debit', () => {
    expect(parseMandiriEmail({ subject: 'Pembayaran Berhasil', text: plainPayment })).toEqual({
      ok: true,
      merchant: 'WARUNG BU SRI',
      amount: 25_500,
      paymentMethod: 'debit',
    });
  });

  it('prefers text over html', () => {
    const result = parseMandiriEmail({ text: plainPayment, html: qrisHtml });
    expect(result).toMatchObject({ ok: true, merchant: 'WARUNG BU SRI' });
  });

  it.each([
    [{ subject: 'Pembayaran Tidak Berhasil', text: plainPayment }, 'failed_transaction'],
    [{ subject: 'Info', text: `${plainPayment}\nTransaksi gagal` }, 'failed_transaction'],
    [{ subject: 'Transfer Berhasil', text: plainPayment }, 'transfer'],
    [{ subject: 'Info', text: 'Nominal Transfer\nRp 100.000' }, 'transfer'],
    [{ subject: 'Top Up Berhasil', text: plainPayment }, 'transfer'],
    [{ subject: 'Promo', text: 'Dapatkan cashback 50%!' }, 'unrecognized'],
    [{ subject: 'Kosong', text: '', html: false as const }, 'empty'],
  ])('skips %j as %s', (email, reason) => {
    expect(parseMandiriEmail(email)).toEqual({ ok: false, reason });
  });
});
