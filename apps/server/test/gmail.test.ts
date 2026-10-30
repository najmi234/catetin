import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { planFetch } from '../src/channels/gmail/poller';
import { processEmail } from '../src/channels/gmail/process';
import type { Services } from '../src/services';
import { createTestDb, setup, silentLogger } from './helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let services: Services;
let owner: string;
let notifications: string[];

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  ({ services, owner } = await setup(testDb.db));
  notifications = [];
});

function rawEmail(opts: { from: string; subject: string; body: string; id?: string }) {
  return [
    `From: ${opts.from}`,
    'To: me@example.com',
    `Subject: ${opts.subject}`,
    `Message-ID: <${opts.id ?? 'abc123'}@mail.example>`,
    'Date: Wed, 30 Sep 2026 10:15:00 +0700',
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
  ].join('\r\n');
}

const MANDIRI = "Livin' by Mandiri <noreply.livin@bankmandiri.co.id>";
const PAYMENT_BODY = [
  'Pembayaran Berhasil',
  'Penerima',
  'KOPI KENANGAN',
  'Nominal Transaksi',
  'Rp 43.000,00',
  'Metode',
  'QRIS',
].join('\n');

async function process(raw: string) {
  const mail = await simpleParser(raw);
  return processEmail(
    mail,
    {
      userId: owner,
      services,
      logger: silentLogger,
      notify: async (text) => {
        notifications.push(text);
      },
    },
    'uid-1',
  );
}

describe('processEmail', () => {
  it('records a Mandiri QRIS payment at the email time and notifies', async () => {
    const outcome = await process(
      rawEmail({ from: MANDIRI, subject: 'Pembayaran Berhasil', body: PAYMENT_BODY }),
    );
    expect(outcome).toBe('recorded');

    const [saved] = await services.transactions.list(owner, { month: '2026-09' });
    expect(saved).toMatchObject({
      merchant: 'KOPI KENANGAN',
      amount: 43_000,
      paymentMethod: 'qris',
      channel: 'email',
    });
    expect(saved!.occurredAt).toEqual(new Date('2026-09-30T03:15:00Z'));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('Rp 43.000');
    expect(notifications[0]).toContain('QRIS');
  });

  it('does not record or notify twice for the same Message-ID', async () => {
    const raw = rawEmail({ from: MANDIRI, subject: 'Pembayaran Berhasil', body: PAYMENT_BODY });
    await process(raw);
    expect(await process(raw)).toBe('duplicate');
    expect(notifications).toHaveLength(1);
  });

  it('ignores other senders, transfers and failed payments', async () => {
    expect(
      await process(
        rawEmail({
          from: 'promo@shop.example',
          subject: 'Pembayaran Berhasil',
          body: PAYMENT_BODY,
        }),
      ),
    ).toBe('ignored');
    expect(
      await process(rawEmail({ from: MANDIRI, subject: 'Transfer Berhasil', body: PAYMENT_BODY })),
    ).toBe('ignored');
    expect(
      await process(
        rawEmail({ from: MANDIRI, subject: 'Pembayaran Tidak Berhasil', body: PAYMENT_BODY }),
      ),
    ).toBe('ignored');
    expect(notifications).toEqual([]);
  });

  it('warns when a Mandiri email cannot be understood', async () => {
    const outcome = await process(
      rawEmail({ from: MANDIRI, subject: 'Notifikasi Transaksi', body: 'Format baru dari bank' }),
    );
    expect(outcome).toBe('unrecognized');
    expect(notifications[0]).toContain('Email Mandiri tidak terbaca');
  });

  it('applies the learned merchant category', async () => {
    const [food] = await services.categories.list(owner);
    await services.categories.learnMerchant(owner, 'Kopi Kenangan', food!.id);
    await process(rawEmail({ from: MANDIRI, subject: 'Pembayaran Berhasil', body: PAYMENT_BODY }));
    const [saved] = await services.transactions.list(owner, { month: '2026-09' });
    expect(saved!.category?.name).toBe('Makanan & Minuman');
  });
});

describe('planFetch', () => {
  const mailbox = { uidValidity: '42', uidNext: 101 };

  it('baselines on first run instead of importing old mail', () => {
    expect(planFetch(null, mailbox)).toEqual({
      action: 'baseline',
      cursor: { uidValidity: '42', lastUid: 100 },
    });
  });

  it('continues after the stored UID — mail that arrived while the server was down included', () => {
    expect(planFetch({ uidValidity: '42', lastUid: 90 }, mailbox)).toEqual({
      action: 'fetch',
      fromUid: 91,
    });
  });

  it('re-baselines when UIDVALIDITY changes', () => {
    expect(planFetch({ uidValidity: '7', lastUid: 90 }, mailbox)).toMatchObject({
      action: 'baseline',
    });
  });
});
