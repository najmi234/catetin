import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Services } from '../src/services';
import { createTestApp, createTestDb, setup } from './helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let services: Services;
let owner: string;
let other: string;
let app: ReturnType<typeof createTestApp>;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  ({ services, owner, other } = await setup(testDb.db));
  app = createTestApp(testDb.db, services);
});

// Tests assert on the JSON shape directly; typing every response adds nothing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponse = Omit<Response, 'json'> & { json(): Promise<any> };

async function call(
  path: string,
  init: Omit<RequestInit, 'body'> & { as?: string; body?: unknown } = {},
): Promise<JsonResponse> {
  const { as = owner, body, ...rest } = init;
  return app.request(path, {
    ...rest,
    headers: {
      ...(as && { 'x-test-user': as }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('auth guard', () => {
  it('answers 401 without a session', async () => {
    const res = await call('/api/transactions?month=2026-07', { as: '' });
    expect(res.status).toBe(401);
  });

  it('keeps /api/health public', async () => {
    const res = await call('/api/health', { as: '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('/api/transactions', () => {
  it('runs the full create → list → update → delete cycle', async () => {
    const created = await call('/api/transactions', {
      method: 'POST',
      body: { merchant: 'kopi', amount: 15_000, occurredAt: '2026-07-10T10:00:00+07:00' },
    });
    expect(created.status).toBe(201);
    const { data: tx } = await created.json();
    expect(tx).toMatchObject({ merchant: 'kopi', amount: 15_000, paymentMethod: 'cash' });
    expect(tx.occurredAt).toBe('2026-07-10T03:00:00.000Z');

    const listed = await (await call('/api/transactions?month=2026-07')).json();
    expect(listed.data.map((t: { id: string }) => t.id)).toEqual([tx.id]);

    const patched = await call(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      body: { amount: 18_000, paymentMethod: 'qris' },
    });
    expect((await patched.json()).data).toMatchObject({ amount: 18_000, paymentMethod: 'qris' });

    expect((await call(`/api/transactions/${tx.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/api/transactions/${tx.id}`)).status).toBe(404);
  });

  it.each([
    [{ merchant: '', amount: 1 }, 'merchant'],
    [{ merchant: 'x', amount: 0 }, 'amount'],
    [{ merchant: 'x', amount: 1.5 }, 'amount'],
    [{ merchant: 'x', amount: 1, paymentMethod: 'crypto' }, 'paymentMethod'],
    [{ merchant: 'x', amount: 1, occurredAt: '2026-07-10 10:00' }, 'occurredAt'],
  ])('rejects %j', async (body, field) => {
    const res = await call('/api/transactions', { method: 'POST', body });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
  });

  it('validates the month and the id', async () => {
    expect((await call('/api/transactions?month=2026-7')).status).toBe(400);
    expect((await call('/api/transactions')).status).toBe(400);
    expect((await call('/api/transactions/not-a-uuid')).status).toBe(400);
  });

  it('rejects an empty update and an unknown category', async () => {
    const { data: tx } = await (
      await call('/api/transactions', { method: 'POST', body: { merchant: 'x', amount: 1 } })
    ).json();
    expect((await call(`/api/transactions/${tx.id}`, { method: 'PATCH', body: {} })).status).toBe(
      400,
    );

    const [foreign] = await services.categories.list(other);
    const res = await call(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      body: { categoryId: foreign!.id },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Kategori tidak ditemukan');
  });

  it('hides other users’ transactions behind 404', async () => {
    const { data: tx } = await (
      await call('/api/transactions', { method: 'POST', body: { merchant: 'x', amount: 1 } })
    ).json();
    expect((await call(`/api/transactions/${tx.id}`, { as: other })).status).toBe(404);
    expect((await call(`/api/transactions/${tx.id}`, { as: other, method: 'DELETE' })).status).toBe(
      404,
    );
  });

  it('quick-adds in the WhatsApp format', async () => {
    const res = await call('/api/transactions/quick', {
      method: 'POST',
      body: { text: 'kopi 15k #makan\nbensin 50rb @qris\nxxx' },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.created).toHaveLength(2);
    expect(data.failed).toEqual([{ line: 'xxx', message: expect.stringContaining('Nominal') }]);

    const nothing = await call('/api/transactions/quick', {
      method: 'POST',
      body: { text: 'halo' },
    });
    expect(nothing.status).toBe(200);
    expect((await nothing.json()).data.created).toEqual([]);
  });
});

describe('/api/summary', () => {
  it('returns the month summary', async () => {
    await call('/api/transactions', {
      method: 'POST',
      body: { merchant: 'x', amount: 7_000, occurredAt: '2026-07-03T08:00:00+07:00' },
    });
    const res = await call('/api/summary?month=2026-07');
    expect((await res.json()).data).toMatchObject({
      total: 7_000,
      daily: [{ day: 3, total: 7_000, count: 1 }],
    });
  });
});

describe('/api/categories', () => {
  it('creates, renames, rejects duplicates and deletes', async () => {
    const created = await call('/api/categories', {
      method: 'POST',
      body: { name: 'Kopi', color: '#6b4f2a' },
    });
    expect(created.status).toBe(201);
    const { data: cat } = await created.json();
    expect(cat.sortOrder).toBe(8);

    const dup = await call('/api/categories', { method: 'POST', body: { name: 'Kopi' } });
    expect(dup.status).toBe(409);

    const renamed = await call(`/api/categories/${cat.id}`, {
      method: 'PATCH',
      body: { name: 'Ngopi' },
    });
    expect((await renamed.json()).data.name).toBe('Ngopi');

    expect((await call(`/api/categories/${cat.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/api/categories/${cat.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('validates the color', async () => {
    const res = await call('/api/categories', {
      method: 'POST',
      body: { name: 'X', color: 'red' },
    });
    expect(res.status).toBe(400);
  });
});

describe('/api/events', () => {
  it('streams transaction events for the logged-in user only', async () => {
    const controller = new AbortController();
    const res = await call('/api/events', { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let received = '';
    const readUntil = async (needle: string) => {
      while (!received.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before ${needle}`);
        received += decoder.decode(value);
      }
    };

    await readUntil('event: ready');
    await services.transactions.create(other, { merchant: 'x', amount: 1 }, { channel: 'app' });
    const mine = await services.transactions.create(
      owner,
      { merchant: 'y', amount: 1 },
      { channel: 'app' },
    );
    await readUntil(mine!.id);

    expect(received).toContain('event: transaction.created');
    expect(received.match(/event: transaction\.created/g)).toHaveLength(1);
    controller.abort();
    await reader.cancel();
  });
});
