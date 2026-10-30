import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../src/services';
import { createTestDb, setup } from './helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let services: Services;
let owner: string;
let other: string;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  ({ services, owner, other } = await setup(testDb.db));
});

const at = (iso: string) => ({ occurredAt: iso });

describe('ensureOwner', () => {
  it('is idempotent and seeds default categories once', async () => {
    expect(await services.ensureOwner('owner@example.com', 'Owner')).toBe(owner);
    const cats = await services.categories.list(owner);
    expect(cats.map((c) => c.name)).toContain('Makanan & Minuman');
    expect(cats).toHaveLength(8);
  });
});

describe('create / list', () => {
  it('lists a WIB month, newest first, with the category attached', async () => {
    const [food] = await services.categories.list(owner);
    // 30 Jun 17:30 UTC = 1 Jul 00:30 WIB → July
    await services.transactions.create(
      owner,
      { merchant: 'kopi', amount: 15_000, categoryId: food!.id, ...at('2026-06-30T17:30:00Z') },
      { channel: 'app' },
    );
    // 30 Jun 16:59 UTC = 30 Jun 23:59 WIB → June
    await services.transactions.create(
      owner,
      { merchant: 'nasi', amount: 20_000, ...at('2026-06-30T16:59:00Z') },
      { channel: 'app' },
    );
    await services.transactions.create(
      owner,
      { merchant: 'parkir', amount: 5_000, ...at('2026-07-15T03:00:00Z') },
      { channel: 'whatsapp' },
    );

    const july = await services.transactions.list(owner, { month: '2026-07' });
    expect(july.map((t) => t.merchant)).toEqual(['parkir', 'kopi']);
    expect(july[1]).toMatchObject({
      amount: 15_000,
      paymentMethod: 'cash',
      channel: 'app',
      category: { name: 'Makanan & Minuman' },
    });
    expect(july[0]!.category).toBeNull();
  });

  it('searches merchant, note and category name', async () => {
    const [food] = await services.categories.list(owner);
    const base = { amount: 1_000, ...at('2026-07-10T03:00:00Z') };
    await services.transactions.create(
      owner,
      { ...base, merchant: 'Kopi Kenangan' },
      { channel: 'app' },
    );
    await services.transactions.create(
      owner,
      { ...base, merchant: 'Toko', note: 'beli kopi bubuk' },
      { channel: 'app' },
    );
    await services.transactions.create(
      owner,
      { ...base, merchant: 'Warteg', categoryId: food!.id },
      { channel: 'app' },
    );
    await services.transactions.create(owner, { ...base, merchant: '100%' }, { channel: 'app' });

    const search = async (q: string) =>
      (await services.transactions.list(owner, { month: '2026-07', q })).map((t) => t.merchant);
    expect((await search('kopi')).sort()).toEqual(['Kopi Kenangan', 'Toko']);
    expect(await search('makanan')).toEqual(['Warteg']);
    expect(await search('%')).toEqual(['100%']);
  });

  it('never shows another user’s data', async () => {
    const t = await services.transactions.create(
      owner,
      { merchant: 'kopi', amount: 1, ...at('2026-07-10T03:00:00Z') },
      { channel: 'app' },
    );
    expect(await services.transactions.list(other, { month: '2026-07' })).toEqual([]);
    expect(await services.transactions.get(other, t!.id)).toBeNull();
    expect(await services.transactions.update(other, t!.id, { amount: 2 })).toBeNull();
    expect(await services.transactions.remove(other, t!.id)).toBe(false);
  });

  it('rejects a category that belongs to someone else', async () => {
    const [otherCat] = await services.categories.list(other);
    await expect(
      services.transactions.create(
        owner,
        { merchant: 'x', amount: 1, categoryId: otherCat!.id },
        { channel: 'app' },
      ),
    ).rejects.toThrow('Kategori tidak ditemukan');
  });

  it('ignores a repeated external id', async () => {
    const input = { merchant: 'kopi', amount: 1 };
    const meta = { channel: 'email' as const, externalId: 'email:<abc@mandiri>' };
    expect(await services.transactions.create(owner, input, meta)).not.toBeNull();
    expect(await services.transactions.create(owner, input, meta)).toBeNull();
  });
});

describe('merchant rules', () => {
  it('learns the category chosen for a merchant and reuses it', async () => {
    const [, transport] = await services.categories.list(owner);
    await services.transactions.create(
      owner,
      { merchant: 'GRAB', amount: 20_000, categoryId: transport!.id },
      { channel: 'app' },
    );
    const next = await services.transactions.create(
      owner,
      { merchant: 'grab', amount: 15_000 },
      { channel: 'whatsapp' },
    );
    expect(next!.category?.id).toBe(transport!.id);

    // An explicit null opts out of the guess
    const none = await services.transactions.create(
      owner,
      { merchant: 'grab', amount: 1, categoryId: null },
      { channel: 'app' },
    );
    expect(none!.category).toBeNull();
  });

  it('learns from an update too', async () => {
    const [food] = await services.categories.list(owner);
    const t = await services.transactions.create(
      owner,
      { merchant: 'Mie Gacoan', amount: 30_000 },
      { channel: 'whatsapp' },
    );
    await services.transactions.update(owner, t!.id, { categoryId: food!.id });
    expect(await services.categories.categoryForMerchant(owner, 'mie  gacoan!')).toBe(food!.id);
  });
});

describe('quickAdd', () => {
  it('records each valid line and reports the rest', async () => {
    const result = await services.transactions.quickAdd(
      owner,
      'kopi 15.5k #makan @qris\nparkir 5rb #nggakada\nkopi 15.5\nhalo',
      { channel: 'whatsapp', occurredAt: '2026-07-10T03:00:00Z' },
    );

    expect(result.created.map((t) => [t.merchant, t.amount, t.paymentMethod])).toEqual([
      ['kopi', 15_500, 'qris'],
      ['parkir', 5_000, 'cash'],
    ]);
    expect(result.created[0]!.category?.name).toBe('Makanan & Minuman');
    expect(result.created[1]!.category).toBeNull();
    expect(result.unknownTags).toEqual(['nggakada']);
    expect(result.failed.map((f) => f.line)).toEqual(['kopi 15.5', 'halo']);
  });

  it('is idempotent per message with an external id prefix', async () => {
    const options = { channel: 'whatsapp' as const, externalIdPrefix: 'wa:MSG1' };
    await services.transactions.quickAdd(owner, 'kopi 15k\nparkir 5rb', options);
    const again = await services.transactions.quickAdd(owner, 'kopi 15k\nparkir 5rb', options);
    expect(again.created).toEqual([]);
    expect(again.duplicates).toBe(2);
  });
});

describe('removeLast', () => {
  it('removes the newest transaction of the given channel only', async () => {
    await services.transactions.create(
      owner,
      { merchant: 'a', amount: 1 },
      { channel: 'whatsapp' },
    );
    await services.transactions.create(
      owner,
      { merchant: 'b', amount: 1 },
      { channel: 'whatsapp' },
    );
    await services.transactions.create(owner, { merchant: 'c', amount: 1 }, { channel: 'app' });

    expect((await services.transactions.removeLast(owner, 'whatsapp'))?.merchant).toBe('b');
    expect((await services.transactions.removeLast(owner, 'whatsapp'))?.merchant).toBe('a');
    expect(await services.transactions.removeLast(owner, 'whatsapp')).toBeNull();
  });
});

describe('summary', () => {
  it('groups by WIB day and category', async () => {
    const cats = await services.categories.list(owner);
    const food = cats[0]!;
    const add = (merchant: string, amount: number, iso: string, categoryId: string | null) =>
      services.transactions.create(
        owner,
        { merchant, amount, categoryId, occurredAt: iso },
        { channel: 'app' },
      );
    await add('a', 10_000, '2026-07-01T01:00:00Z', food.id); // 1 Jul WIB
    await add('b', 5_000, '2026-07-01T16:59:00Z', null); // 1 Jul 23:59 WIB
    await add('c', 30_000, '2026-07-01T17:00:00Z', food.id); // 2 Jul 00:00 WIB
    await add('d', 99_000, '2026-06-30T16:00:00Z', food.id); // June — excluded

    const s = await services.summary.month(owner, '2026-07');
    expect(s).toMatchObject({
      total: 45_000,
      count: 3,
      activeDays: 2,
      averagePerActiveDay: 22_500,
    });
    expect(s.daily).toEqual([
      { day: 1, total: 15_000, count: 2 },
      { day: 2, total: 30_000, count: 1 },
    ]);
    expect(s.byCategory.map((c) => [c.name, c.total, c.count])).toEqual([
      ['Makanan & Minuman', 40_000, 2],
      ['Tanpa kategori', 5_000, 1],
    ]);
  });

  it('returns zeros for an empty month', async () => {
    expect(await services.summary.month(owner, '2026-01')).toMatchObject({
      total: 0,
      count: 0,
      activeDays: 0,
      averagePerActiveDay: 0,
      daily: [],
      byCategory: [],
    });
  });
});

describe('categories', () => {
  it('resolves #tags by exact name or unique prefix', async () => {
    const resolve = async (tag: string) =>
      (await services.categories.resolveTag(owner, tag))?.name ?? null;
    expect(await resolve('makan')).toBe('Makanan & Minuman');
    expect(await resolve('transportasi')).toBe('Transportasi');
    expect(await resolve('Tagihan')).toBe('Tagihan');
    expect(await resolve('xyz')).toBeNull();

    await services.categories.create(owner, { name: 'Pendidikan' });
    expect(await resolve('pe')).toBeNull(); // Pengembangan Diri vs Pendidikan
  });

  it('rejects a duplicate name', async () => {
    await expect(services.categories.create(owner, { name: 'Transportasi' })).rejects.toThrow(
      'sudah dipakai',
    );
  });

  it('keeps transactions when their category is deleted', async () => {
    const [food] = await services.categories.list(owner);
    const t = await services.transactions.create(
      owner,
      { merchant: 'kopi', amount: 1, categoryId: food!.id },
      { channel: 'app' },
    );
    expect(await services.categories.remove(owner, food!.id)).toBe(true);
    expect((await services.transactions.get(owner, t!.id))?.category).toBeNull();
  });
});
