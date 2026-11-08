import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleWhatsAppText } from '../src/channels/whatsapp/commands';
import type { Services } from '../src/services';
import { createTestApp, createTestDb, setup } from './helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let services: Services;
let owner: string;
let other: string;
let seq = 0;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  ({ services, owner, other } = await setup(testDb.db));
});

const balanceOf = async (id: string) => (await services.pockets.get(owner, id))!.balance;

async function pocketWithCategory(name: string, categoryName: string, topUp = 0) {
  const pocket = await services.pockets.create(owner, { name });
  const category = (await services.categories.list(owner)).find((c) => c.name === categoryName)!;
  await services.categories.update(owner, category.id, { pocketId: pocket.id });
  if (topUp) await services.pockets.topUp(owner, pocket.id, { amount: topUp });
  return { pocket, category };
}

describe('balances', () => {
  it('is top-ups minus the expenses taken from the pocket, and may go negative', async () => {
    const { pocket, category } = await pocketWithCategory('Bensin', 'Transportasi', 300_000);
    expect(await balanceOf(pocket.id)).toBe(300_000);

    const t = await services.transactions.create(
      owner,
      { merchant: 'pertamina', amount: 50_000, categoryId: category.id },
      { channel: 'app' },
    );
    expect(t!.pocket?.name).toBe('Bensin');
    expect(await balanceOf(pocket.id)).toBe(250_000);

    await services.transactions.create(
      owner,
      { merchant: 'shell', amount: 280_000, categoryId: category.id },
      { channel: 'app' },
    );
    expect(await balanceOf(pocket.id)).toBe(-30_000);
  });

  it('follows edits and deletions of expenses', async () => {
    const { pocket, category } = await pocketWithCategory('Bensin', 'Transportasi', 100_000);
    const t = await services.transactions.create(
      owner,
      { merchant: 'grab', amount: 40_000, categoryId: category.id },
      { channel: 'app' },
    );

    await services.transactions.update(owner, t!.id, { amount: 60_000 });
    expect(await balanceOf(pocket.id)).toBe(40_000);

    // Moving to a category without a pocket releases it from the pocket
    const [food] = await services.categories.list(owner);
    await services.transactions.update(owner, t!.id, { categoryId: food!.id });
    expect(await balanceOf(pocket.id)).toBe(100_000);

    await services.transactions.update(owner, t!.id, { pocketId: pocket.id });
    expect(await balanceOf(pocket.id)).toBe(40_000);
    await services.transactions.remove(owner, t!.id);
    expect(await balanceOf(pocket.id)).toBe(100_000);
  });

  it('lets an explicit pocket override the category, and null opt out', async () => {
    const { category } = await pocketWithCategory('Bensin', 'Transportasi');
    const servis = await services.pockets.create(owner, { name: 'Servis' });

    const chosen = await services.transactions.create(
      owner,
      { merchant: 'bengkel', amount: 1, categoryId: category.id, pocketId: servis.id },
      { channel: 'app' },
    );
    expect(chosen!.pocket?.name).toBe('Servis');

    const none = await services.transactions.create(
      owner,
      { merchant: 'tol', amount: 1, categoryId: category.id, pocketId: null },
      { channel: 'app' },
    );
    expect(none!.pocket).toBeNull();
  });

  it('uses the pocket of a category guessed from the merchant history', async () => {
    const { category } = await pocketWithCategory('Bensin', 'Transportasi');
    await services.categories.learnMerchant(owner, 'Pertamina', category.id);
    const t = await services.transactions.create(
      owner,
      { merchant: 'pertamina', amount: 1 },
      { channel: 'email' },
    );
    expect(t!.pocket?.name).toBe('Bensin');
  });

  it('keeps expenses when their pocket is deleted', async () => {
    const { pocket, category } = await pocketWithCategory('Bensin', 'Transportasi');
    const t = await services.transactions.create(
      owner,
      { merchant: 'x', amount: 1, categoryId: category.id },
      { channel: 'app' },
    );
    expect(await services.pockets.remove(owner, pocket.id)).toBe(true);
    expect((await services.transactions.get(owner, t!.id))!.pocket).toBeNull();
    expect((await services.categories.findOwned(owner, category.id))!.pocketId).toBeNull();
  });
});

describe('transfers and entries', () => {
  it('moves money atomically and undoes both halves together', async () => {
    const jajan = await services.pockets.create(owner, { name: 'Jajan' });
    const bensin = await services.pockets.create(owner, { name: 'Bensin' });
    await services.pockets.topUp(owner, jajan.id, { amount: 100_000 });

    const { from, to } = await services.pockets.transfer(owner, {
      fromPocketId: jajan.id,
      toPocketId: bensin.id,
      amount: 30_000,
    });
    expect([from.balance, to.balance]).toEqual([70_000, 30_000]);

    const [transferIn] = await services.pockets.activity(owner, bensin.id, monthNow());
    expect(transferIn).toMatchObject({ kind: 'transfer_in', amount: 30_000 });
    expect(await services.pockets.removeEntry(owner, transferIn!.id)).toBe(true);
    expect([await balanceOf(jajan.id), await balanceOf(bensin.id)]).toEqual([100_000, 0]);
  });

  it('lists top-ups and expenses of a month, newest first', async () => {
    const { pocket, category } = await pocketWithCategory('Bensin', 'Transportasi');
    await services.pockets.topUp(owner, pocket.id, {
      amount: 300_000,
      occurredAt: '2026-07-01T01:00:00Z',
    });
    await services.transactions.create(
      owner,
      {
        merchant: 'pertamina',
        amount: 50_000,
        categoryId: category.id,
        occurredAt: '2026-07-03T01:00:00Z',
      },
      { channel: 'app' },
    );
    const activity = await services.pockets.activity(owner, pocket.id, '2026-07');
    expect(activity.map((a) => [a.kind, a.amount, a.title])).toEqual([
      ['expense', -50_000, 'pertamina'],
      ['topup', 300_000, 'Isi saldo'],
    ]);
  });

  it('refuses pockets of another user', async () => {
    const mine = await services.pockets.create(owner, { name: 'Jajan' });
    const theirs = await services.pockets.create(other, { name: 'Jajan' });
    await expect(
      services.pockets.transfer(owner, {
        fromPocketId: mine.id,
        toPocketId: theirs.id,
        amount: 1,
      }),
    ).rejects.toThrow('Kantong tidak ditemukan');
    expect(await services.pockets.topUp(owner, theirs.id, { amount: 1 })).toBeNull();
  });
});

describe('WhatsApp', () => {
  const send = (text: string) =>
    handleWhatsAppText(text, {
      userId: owner,
      services,
      messageId: `P${++seq}`,
      sentAt: new Date(),
    });

  beforeEach(async () => {
    await pocketWithCategory('Bensin', 'Transportasi', 100_000);
    await services.pockets.create(owner, { name: 'Kos dan Kuota' });
    await services.pockets.create(owner, { name: 'Jajan' });
  });

  it('reports the pocket balance after an expense, and warns when it goes negative', async () => {
    expect(await send('pertamina 40rb #transport')).toContain('💼 Sisa Bensin: Rp 60.000');
    expect(await send('shell 80rb #transport')).toContain('⚠️ Kantong Bensin minus: -Rp 20.000');
  });

  it('takes a $pocket from the message', async () => {
    const reply = await send('pulsa 50rb $kos');
    expect(reply).toContain('⚠️ Kantong Kos dan Kuota minus: -Rp 50.000');
    expect(await send('kopi 15k $nggakada')).toContain('Kantong $nggakada tidak ditemukan');
  });

  it('!isi tops up, including multi-word pockets and "50 rb"', async () => {
    expect(await send('!isi bensin 300rb')).toBe('💼 *Bensin* +Rp 300.000\nSaldo: Rp 400.000');
    expect(await send('!isi kos dan kuota 450 rb')).toContain('Saldo: Rp 450.000');
    expect(await send('!isi bensin')).toContain('Format: `!isi');
    expect(await send('!isi motor 10rb')).toContain('Kantong "motor" tidak ditemukan');
  });

  it('!pindah moves money between pockets', async () => {
    const reply = await send('!pindah bensin jajan 25rb');
    expect(reply).toContain('Bensin: Rp 75.000');
    expect(reply).toContain('Jajan: Rp 25.000');
    expect(await send('!pindah bensin bensin 1rb')).toContain('harus berbeda');
  });

  it('!kantong lists balances with a total', async () => {
    await send('kopi 10rb $jajan');
    const reply = await send('!kantong');
    expect(reply).toContain('• Bensin: Rp 100.000');
    expect(reply).toContain('⚠️ Jajan: -Rp 10.000');
    expect(reply).toContain('Total: Rp 90.000');
  });
});

describe('/api/pockets', () => {
  it('creates, tops up, transfers, lists activity and deletes', async () => {
    const app = createTestApp(testDb.db, services);
    // Assertions check the JSON shape directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type JsonResponse = Omit<Response, 'json'> & { json(): Promise<any> };
    const call = async (path: string, method = 'GET', body?: unknown): Promise<JsonResponse> =>
      app.request(path, {
        method,
        headers: { 'x-test-user': owner, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const a = (await (await call('/api/pockets', 'POST', { name: 'Jajan' })).json()).data;
    const b = (await (await call('/api/pockets', 'POST', { name: 'Bensin' })).json()).data;
    expect((await call('/api/pockets', 'POST', { name: 'Jajan' })).status).toBe(409);

    const topped = await call(`/api/pockets/${a.id}/topup`, 'POST', { amount: 100_000 });
    expect((await topped.json()).data.balance).toBe(100_000);

    const moved = await call('/api/pockets/transfer', 'POST', {
      fromPocketId: a.id,
      toPocketId: b.id,
      amount: 40_000,
    });
    expect(moved.status).toBe(201);
    const same = await call('/api/pockets/transfer', 'POST', {
      fromPocketId: a.id,
      toPocketId: a.id,
      amount: 1,
    });
    expect(same.status).toBe(400);

    const list = (await (await call('/api/pockets')).json()).data;
    expect(list.map((p: { name: string; balance: number }) => [p.name, p.balance])).toEqual([
      ['Jajan', 60_000],
      ['Bensin', 40_000],
    ]);

    const activity = await call(`/api/pockets/${a.id}/activity?month=${monthNow()}`);
    expect((await activity.json()).data).toHaveLength(2);

    // A category can point at a pocket; a foreign or unknown pocket is rejected
    const [food] = await services.categories.list(owner);
    const linked = await call(`/api/categories/${food!.id}`, 'PATCH', { pocketId: a.id });
    expect((await linked.json()).data.pocketId).toBe(a.id);
    const theirs = await services.pockets.create(other, { name: 'X' });
    expect(
      (await call(`/api/categories/${food!.id}`, 'PATCH', { pocketId: theirs.id })).status,
    ).toBe(400);

    expect((await call(`/api/pockets/${a.id}`, 'DELETE')).status).toBe(200);
    expect((await call(`/api/pockets/${a.id}`)).status).toBe(404);
  });
});

function monthNow() {
  const now = new Date(Date.now() + 7 * 3600_000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
