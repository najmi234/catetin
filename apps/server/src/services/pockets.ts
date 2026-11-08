import { monthRange, type PocketInput } from '@catetin/shared';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from '../db/client';
import { categories, pocketEntries, pockets, transactions } from '../db/schema';
import { isUniqueViolation, matchByName } from './categories';
import type { EventBus } from './events';

export interface PocketView {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  /** Top-ups and transfers in, minus transfers out and expenses. May be negative. */
  balance: number;
}

export interface PocketActivity {
  id: string;
  kind: 'topup' | 'transfer_in' | 'transfer_out' | 'expense';
  /** Signed: positive adds to the pocket, negative takes from it. */
  amount: number;
  title: string;
  note: string | null;
  occurredAt: Date;
  /** Set for expenses, so the app can open the transaction. */
  transactionId: string | null;
  category: { name: string; color: string; icon: string } | null;
}

export class InvalidPocketError extends Error {
  constructor() {
    super('Kantong tidak ditemukan');
  }
}

export class PocketNameTakenError extends Error {
  constructor() {
    super('Nama kantong sudah dipakai');
  }
}

const ENTRY_TITLES = {
  topup: 'Isi saldo',
  transfer_in: 'Pindahan masuk',
  transfer_out: 'Pindahan keluar',
} as const;

export function createPocketService(db: Db, events: EventBus) {
  // Computed on read; see the comment on the pockets table
  const funded = sql<number>`coalesce((select sum(${pocketEntries.amount}) from ${pocketEntries} where ${pocketEntries.pocketId} = ${pockets.id}), 0)`;
  const spent = sql<number>`coalesce((select sum(${transactions.amount}) from ${transactions} where ${transactions.pocketId} = ${pockets.id}), 0)`;
  const balance = sql<number>`(${funded} - ${spent})`.mapWith(Number);

  const columns = {
    id: pockets.id,
    name: pockets.name,
    color: pockets.color,
    icon: pockets.icon,
    sortOrder: pockets.sortOrder,
    balance,
  };

  async function list(userId: string): Promise<PocketView[]> {
    return db
      .select(columns)
      .from(pockets)
      .where(eq(pockets.userId, userId))
      .orderBy(asc(pockets.sortOrder), asc(pockets.name));
  }

  async function get(userId: string, id: string): Promise<PocketView | null> {
    const [row] = await db
      .select(columns)
      .from(pockets)
      .where(and(eq(pockets.userId, userId), eq(pockets.id, id)));
    return row ?? null;
  }

  /** Throws InvalidPocketError unless the pocket exists and belongs to the user. Null/undefined pass. */
  async function assertOwned(userId: string, id: string | null | undefined): Promise<void> {
    if (!id) return;
    const [row] = await db
      .select({ id: pockets.id })
      .from(pockets)
      .where(and(eq(pockets.userId, userId), eq(pockets.id, id)));
    if (!row) throw new InvalidPocketError();
  }

  async function guardUniqueName<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (isUniqueViolation(err)) throw new PocketNameTakenError();
      throw err;
    }
  }

  function changed(userId: string) {
    events.publish(userId, { type: 'pockets.changed' });
  }

  return {
    list,
    get,
    assertOwned,

    async create(userId: string, input: PocketInput): Promise<PocketView> {
      const [{ next } = { next: 0 }] = await db
        .select({ next: sql<number>`coalesce(max(${pockets.sortOrder}), -1)::int + 1` })
        .from(pockets)
        .where(eq(pockets.userId, userId));
      const [row] = await guardUniqueName(() =>
        db
          .insert(pockets)
          .values({ ...input, userId, sortOrder: next })
          .returning({ id: pockets.id }),
      );
      changed(userId);
      return (await get(userId, row!.id))!;
    },

    async update(
      userId: string,
      id: string,
      input: Partial<PocketInput> & { sortOrder?: number },
    ): Promise<PocketView | null> {
      const [row] = await guardUniqueName(() =>
        db
          .update(pockets)
          .set(input)
          .where(and(eq(pockets.userId, userId), eq(pockets.id, id)))
          .returning({ id: pockets.id }),
      );
      if (!row) return null;
      changed(userId);
      return get(userId, id);
    },

    /** Expenses stay recorded, without a pocket; top-ups and transfers of the pocket go with it. */
    async remove(userId: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(pockets)
        .where(and(eq(pockets.userId, userId), eq(pockets.id, id)))
        .returning({ id: pockets.id });
      if (deleted.length === 0) return false;
      changed(userId);
      return true;
    },

    async topUp(
      userId: string,
      pocketId: string,
      input: { amount: number; note?: string | null; occurredAt?: string | Date },
    ): Promise<PocketView | null> {
      if (!(await get(userId, pocketId))) return null;
      await db.insert(pocketEntries).values({
        userId,
        pocketId,
        kind: 'topup',
        amount: input.amount,
        note: input.note ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      });
      changed(userId);
      return get(userId, pocketId);
    },

    /** Move money between two of the user's pockets as one atomic pair of entries. */
    async transfer(
      userId: string,
      input: { fromPocketId: string; toPocketId: string; amount: number; note?: string | null },
    ): Promise<{ from: PocketView; to: PocketView }> {
      await assertOwned(userId, input.fromPocketId);
      await assertOwned(userId, input.toPocketId);
      const transferId = uuidv7();
      const occurredAt = new Date();
      const note = input.note ?? null;
      await db.insert(pocketEntries).values([
        {
          userId,
          pocketId: input.fromPocketId,
          kind: 'transfer_out' as const,
          amount: -input.amount,
          transferId,
          note,
          occurredAt,
        },
        {
          userId,
          pocketId: input.toPocketId,
          kind: 'transfer_in' as const,
          amount: input.amount,
          transferId,
          note,
          occurredAt,
        },
      ]);
      changed(userId);
      return {
        from: (await get(userId, input.fromPocketId))!,
        to: (await get(userId, input.toPocketId))!,
      };
    },

    /** Undo a top-up, or both halves of a transfer. */
    async removeEntry(userId: string, entryId: string): Promise<boolean> {
      const [entry] = await db
        .select({ transferId: pocketEntries.transferId })
        .from(pocketEntries)
        .where(and(eq(pocketEntries.userId, userId), eq(pocketEntries.id, entryId)));
      if (!entry) return false;
      await db
        .delete(pocketEntries)
        .where(
          and(
            eq(pocketEntries.userId, userId),
            entry.transferId
              ? eq(pocketEntries.transferId, entry.transferId)
              : eq(pocketEntries.id, entryId),
          ),
        );
      changed(userId);
      return true;
    },

    /** Everything that moved the pocket's balance in a WIB month, newest first. */
    async activity(userId: string, pocketId: string, month: string): Promise<PocketActivity[]> {
      const range = monthRange(month);
      if (!range) throw new Error(`Bulan tidak valid: ${month}`);

      const entries = await db
        .select()
        .from(pocketEntries)
        .where(
          and(
            eq(pocketEntries.userId, userId),
            eq(pocketEntries.pocketId, pocketId),
            gte(pocketEntries.occurredAt, range.start),
            lt(pocketEntries.occurredAt, range.end),
          ),
        );
      const expenses = await db
        .select({
          id: transactions.id,
          merchant: transactions.merchant,
          amount: transactions.amount,
          note: transactions.note,
          occurredAt: transactions.occurredAt,
          categoryName: categories.name,
          categoryColor: categories.color,
          categoryIcon: categories.icon,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.pocketId, pocketId),
            gte(transactions.occurredAt, range.start),
            lt(transactions.occurredAt, range.end),
          ),
        )
        .orderBy(desc(transactions.occurredAt));

      const items: PocketActivity[] = [
        ...entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          amount: e.amount,
          title: ENTRY_TITLES[e.kind],
          note: e.note,
          occurredAt: e.occurredAt,
          transactionId: null,
          category: null,
        })),
        ...expenses.map((t) => ({
          id: t.id,
          kind: 'expense' as const,
          amount: -t.amount,
          title: t.merchant,
          note: t.note,
          occurredAt: t.occurredAt,
          transactionId: t.id,
          category: t.categoryName
            ? { name: t.categoryName, color: t.categoryColor!, icon: t.categoryIcon! }
            : null,
        })),
      ];
      return items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    },

    /** Resolve a "$tag" or a typed name to a pocket, see matchByName. */
    async resolveTag(userId: string, tag: string): Promise<PocketView | null> {
      return matchByName(await list(userId), tag);
    },
  };
}

export type PocketService = ReturnType<typeof createPocketService>;
