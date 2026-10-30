import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleWhatsAppText } from '../src/channels/whatsapp/commands';
import type { Services } from '../src/services';
import { createTestDb, setup } from './helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let services: Services;
let owner: string;
let seq = 0;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  ({ services, owner } = await setup(testDb.db));
});

// 30 Sep 2026, 10:00 WIB — a 30-day month, to exercise "!t31"
const NOW = new Date('2026-09-30T03:00:00Z');

function send(text: string, options: { id?: string; sentAt?: Date } = {}) {
  return handleWhatsAppText(text, {
    userId: owner,
    services,
    messageId: options.id ?? `MSG${++seq}`,
    sentAt: options.sentAt ?? NOW,
  });
}

describe('recording', () => {
  it('records and confirms a single expense', async () => {
    const reply = await send('kopi 15.5k');
    expect(reply).toContain('✅ *Tercatat*');
    expect(reply).toContain('kopi — Rp 15.500');

    const [saved] = await services.transactions.list(owner, { month: '2026-09' });
    expect(saved).toMatchObject({ channel: 'whatsapp', paymentMethod: 'cash' });
    expect(saved!.occurredAt).toEqual(NOW);
  });

  it('records several lines with tags and reports problems', async () => {
    const reply = await send('kopi 15k #makan\nbensin 50rb @qris #bensinan\nparkir 5.5');
    expect(reply).toContain('Tercatat 2 item');
    expect(reply).toContain('kopi — Rp 15.000 (Makanan & Minuman)');
    expect(reply).toContain('bensin — Rp 50.000 (QRIS)');
    expect(reply).toContain('Total: Rp 65.000');
    expect(reply).toContain('#bensinan tidak ditemukan');
    expect(reply).toContain('"parkir 5.5": Nominal tidak dikenali');
  });

  it('stays silent for ordinary chat', async () => {
    expect(await send('halo, jangan lupa beli susu')).toBeNull();
    expect(await send('   ')).toBeNull();
  });

  it('records a redelivered message only once, and stays silent the second time', async () => {
    expect(await send('kopi 15k', { id: 'SAME' })).toContain('Tercatat');
    expect(await send('kopi 15k', { id: 'SAME' })).toBeNull();
    expect(await services.transactions.list(owner, { month: '2026-09' })).toHaveLength(1);
  });

  // The old bot dropped any identical text sent within 5 seconds
  it('records the same text twice when it really is two messages', async () => {
    await send('parkir 5rb');
    await send('parkir 5rb');
    expect(await services.transactions.list(owner, { month: '2026-09' })).toHaveLength(2);
  });
});

describe('commands', () => {
  beforeEach(async () => {
    await send('kopi 15k', { sentAt: new Date('2026-09-30T01:00:00Z') }); // 30 Sep
    await send('nasi 20rb #makan', { sentAt: new Date('2026-09-30T05:00:00Z') }); // 30 Sep
    await send('bensin 50rb', { sentAt: new Date('2026-09-09T05:00:00Z') }); // 9 Sep
  });

  it('!help', async () => {
    expect(await send('!help')).toContain('Catetin — Bantuan');
    expect(await send('!H')).toContain('Catetin — Bantuan');
  });

  it('!t lists today oldest first with a total', async () => {
    const reply = await send('!t');
    expect(reply).toContain('Pengeluaran Hari Ini');
    expect(reply).toMatch(/1\. kopi — Rp 15\.000\n2\. nasi — Rp 20\.000 \(Makanan & Minuman\)/);
    expect(reply).toContain('Total: Rp 35.000');
  });

  it('!t<day> picks a date in the current month', async () => {
    expect(await send('!t9')).toContain('bensin — Rp 50.000');
    expect(await send('!t1')).toContain('Belum ada catatan');
  });

  it('!t31 in September is rejected instead of silently showing 1 October', async () => {
    expect(await send('!t31')).toBe('❌ Tanggal 31 tidak ada di bulan ini.');
  });

  it('!m summarises the month per day', async () => {
    const reply = await send('!m');
    expect(reply).toContain('September 2026');
    expect(reply).toContain('• Tgl 9: Rp 50.000');
    expect(reply).toContain('• Tgl 30: Rp 35.000');
    expect(reply).toContain('Total: Rp 85.000');
  });

  it('!undo removes the latest WhatsApp entry', async () => {
    expect(await send('!undo')).toBe('🗑️ Dihapus: bensin — Rp 50.000');
    expect(await services.transactions.list(owner, { month: '2026-09' })).toHaveLength(2);
  });

  it('answers unknown commands', async () => {
    expect(await send('!apa')).toContain('Perintah tidak dikenal');
  });
});
