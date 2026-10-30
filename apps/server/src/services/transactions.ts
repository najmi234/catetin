import {
  dayRange,
  describeParseError,
  monthRange,
  parseExpenseText,
  type Channel,
  type PaymentMethod,
} from '@catetin/shared';
import { and, asc, desc, eq, gte, ilike, lt, or, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, transactions } from '../db/schema';
import type { CategoryService } from './categories';
import type { EventBus } from './events';

export interface TransactionView {
  id: string;
  merchant: string;
  amount: number;
  paymentMethod: PaymentMethod;
  channel: Channel;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
  category: { id: string; name: string; color: string; icon: string } | null;
}

/** Already validated by the zod schemas in @catetin/shared. */
export interface NewTransaction {
  merchant: string;
  amount: number;
  /** undefined = guess from the merchant history, null = explicitly none */
  categoryId?: string | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
  occurredAt?: string | Date;
}

export type TransactionChanges = Partial<Omit<NewTransaction, 'categoryId'>> & {
  categoryId?: string | null;
};

export interface QuickAddResult {
  created: TransactionView[];
  failed: { line: string; message: string }[];
  /** "#tags" that matched no category; those lines were saved without one. */
  unknownTags: string[];
  /** Lines skipped because their external id was already recorded. */
  duplicates: number;
}

export class InvalidCategoryError extends Error {
  constructor() {
    super('Kategori tidak ditemukan');
  }
}

const viewColumns = {
  id: transactions.id,
  merchant: transactions.merchant,
  amount: transactions.amount,
  paymentMethod: transactions.paymentMethod,
  channel: transactions.channel,
  note: transactions.note,
  occurredAt: transactions.occurredAt,
  createdAt: transactions.createdAt,
  categoryId: categories.id,
  categoryName: categories.name,
  categoryColor: categories.color,
  categoryIcon: categories.icon,
};

type ViewRow = {
  [K in keyof typeof viewColumns]: (typeof viewColumns)[K]['_']['data'] | null;
};

function toView(row: ViewRow): TransactionView {
  return {
    id: row.id!,
    merchant: row.merchant!,
    amount: row.amount!,
    paymentMethod: row.paymentMethod!,
    channel: row.channel!,
    note: row.note,
    occurredAt: row.occurredAt!,
    createdAt: row.createdAt!,
    category: row.categoryId
      ? {
          id: row.categoryId,
          name: row.categoryName!,
          color: row.categoryColor!,
          icon: row.categoryIcon!,
        }
      : null,
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

export function createTransactionService(db: Db, events: EventBus, cats: CategoryService) {
  async function select(where: SQL | undefined, order: 'asc' | 'desc' = 'desc') {
    const rows = await db
      .select(viewColumns)
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(where)
      .orderBy(
        order === 'desc' ? desc(transactions.occurredAt) : asc(transactions.occurredAt),
        order === 'desc' ? desc(transactions.createdAt) : asc(transactions.createdAt),
      );
    return rows.map(toView);
  }

  async function get(userId: string, id: string): Promise<TransactionView | null> {
    const [row] = await select(and(eq(transactions.userId, userId), eq(transactions.id, id)));
    return row ?? null;
  }

  async function assertCategory(userId: string, categoryId: string | null | undefined) {
    if (categoryId && !(await cats.findOwned(userId, categoryId))) throw new InvalidCategoryError();
  }

  /** Returns null when `externalId` was already recorded. */
  async function create(
    userId: string,
    input: NewTransaction,
    meta: { channel: Channel; externalId?: string },
  ): Promise<TransactionView | null> {
    await assertCategory(userId, input.categoryId);
    const categoryId =
      input.categoryId === undefined
        ? await cats.categoryForMerchant(userId, input.merchant)
        : input.categoryId;

    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        merchant: input.merchant,
        amount: input.amount,
        categoryId,
        paymentMethod: input.paymentMethod ?? 'cash',
        note: input.note ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        channel: meta.channel,
        externalId: meta.externalId ?? null,
      })
      .onConflictDoNothing({ target: transactions.externalId })
      .returning({ id: transactions.id });
    if (!row) return null;

    if (input.categoryId) await cats.learnMerchant(userId, input.merchant, input.categoryId);
    events.publish(userId, { type: 'transaction.created', id: row.id });
    return get(userId, row.id);
  }

  return {
    get,
    create,

    async list(userId: string, query: { month: string; q?: string }): Promise<TransactionView[]> {
      const range = monthRange(query.month);
      if (!range) throw new Error(`Bulan tidak valid: ${query.month}`);

      const conditions = [
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ];
      if (query.q) {
        const pattern = `%${escapeLike(query.q)}%`;
        conditions.push(
          or(
            ilike(transactions.merchant, pattern),
            ilike(transactions.note, pattern),
            ilike(categories.name, pattern),
          )!,
        );
      }
      return select(and(...conditions));
    },

    /** Transactions of one WIB day, oldest first. Null when the date does not exist. */
    async listDay(
      userId: string,
      date: { year: number; month: number; day: number },
    ): Promise<TransactionView[] | null> {
      const range = dayRange(date.year, date.month, date.day);
      if (!range) return null;
      return select(
        and(
          eq(transactions.userId, userId),
          gte(transactions.occurredAt, range.start),
          lt(transactions.occurredAt, range.end),
        ),
        'asc',
      );
    },

    async update(
      userId: string,
      id: string,
      changes: TransactionChanges,
    ): Promise<TransactionView | null> {
      await assertCategory(userId, changes.categoryId);
      const { occurredAt, ...rest } = changes;
      const [row] = await db
        .update(transactions)
        .set({ ...rest, ...(occurredAt !== undefined && { occurredAt: new Date(occurredAt) }) })
        .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
        .returning({ id: transactions.id, merchant: transactions.merchant });
      if (!row) return null;

      if (changes.categoryId) await cats.learnMerchant(userId, row.merchant, changes.categoryId);
      events.publish(userId, { type: 'transaction.updated', id });
      return get(userId, id);
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
        .returning({ id: transactions.id });
      if (deleted.length === 0) return false;
      events.publish(userId, { type: 'transaction.deleted', id });
      return true;
    },

    /** Delete the most recently recorded transaction from a channel ("!undo"). */
    async removeLast(userId: string, channel: Channel): Promise<TransactionView | null> {
      const [last] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.channel, channel)))
        .orderBy(desc(transactions.createdAt), desc(transactions.id))
        .limit(1);
      if (!last) return null;
      const view = await get(userId, last.id);
      await db.delete(transactions).where(eq(transactions.id, last.id));
      events.publish(userId, { type: 'transaction.deleted', id: last.id });
      return view;
    },

    /**
     * Record free text in the WhatsApp format — one expense per line.
     * With `externalIdPrefix`, line N gets external id "<prefix>:N" so a redelivered
     * message is not recorded twice.
     */
    async quickAdd(
      userId: string,
      text: string,
      options: {
        channel: Channel;
        occurredAt?: string | Date;
        defaultPaymentMethod?: PaymentMethod;
        externalIdPrefix?: string;
      },
    ): Promise<QuickAddResult> {
      const result: QuickAddResult = { created: [], failed: [], unknownTags: [], duplicates: 0 };

      for (const [index, line] of parseExpenseText(text).entries()) {
        if (!line.ok) {
          result.failed.push({ line: line.line, message: describeParseError(line.error) });
          continue;
        }

        const { merchant, amount, categoryTag, paymentMethod } = line.expense;
        let categoryId: string | undefined;
        if (categoryTag) {
          const category = await cats.resolveTag(userId, categoryTag);
          if (category) categoryId = category.id;
          else result.unknownTags.push(categoryTag);
        }

        const created = await create(
          userId,
          {
            merchant,
            amount,
            categoryId,
            paymentMethod: paymentMethod ?? options.defaultPaymentMethod ?? 'cash',
            occurredAt: options.occurredAt,
          },
          {
            channel: options.channel,
            externalId: options.externalIdPrefix && `${options.externalIdPrefix}:${index}`,
          },
        );
        if (created) result.created.push(created);
        else result.duplicates++;
      }
      return result;
    },
  };
}

export type TransactionService = ReturnType<typeof createTransactionService>;
