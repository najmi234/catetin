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
import { categories, pockets, transactions } from '../db/schema';
import type { CategoryService } from './categories';
import type { EventBus } from './events';
import type { PocketService } from './pockets';

type Badge = { id: string; name: string; color: string; icon: string };

export interface TransactionView {
  id: string;
  merchant: string;
  amount: number;
  paymentMethod: PaymentMethod;
  channel: Channel;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
  category: Badge | null;
  pocket: Badge | null;
}

/** Already validated by the zod schemas in @catetin/shared. */
export interface NewTransaction {
  merchant: string;
  amount: number;
  /** undefined = guess from the merchant history, null = explicitly none */
  categoryId?: string | null;
  /** undefined = the category's pocket, null = explicitly none */
  pocketId?: string | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
  occurredAt?: string | Date;
}

export type TransactionChanges = Partial<NewTransaction>;

export interface QuickAddResult {
  created: TransactionView[];
  failed: { line: string; message: string }[];
  /** "#tags" that matched no category; those lines were saved without one. */
  unknownTags: string[];
  /** "$tags" that matched no pocket; those lines fell back to the category's pocket. */
  unknownPockets: string[];
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
  pocketId: pockets.id,
  pocketName: pockets.name,
  pocketColor: pockets.color,
  pocketIcon: pockets.icon,
};

type ViewRow = {
  [K in keyof typeof viewColumns]: (typeof viewColumns)[K]['_']['data'] | null;
};

function badge(
  id: string | null,
  name: string | null,
  color: string | null,
  icon: string | null,
): Badge | null {
  return id ? { id, name: name!, color: color!, icon: icon! } : null;
}

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
    category: badge(row.categoryId, row.categoryName, row.categoryColor, row.categoryIcon),
    pocket: badge(row.pocketId, row.pocketName, row.pocketColor, row.pocketIcon),
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

export function createTransactionService(
  db: Db,
  events: EventBus,
  cats: CategoryService,
  pocketService: PocketService,
) {
  async function select(where: SQL | undefined, order: 'asc' | 'desc' = 'desc') {
    const rows = await db
      .select(viewColumns)
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(pockets, eq(pockets.id, transactions.pocketId))
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

  /** The pocket a category draws from by default. */
  async function pocketOfCategory(
    userId: string,
    categoryId: string | null,
  ): Promise<string | null> {
    if (!categoryId) return null;
    return (await cats.findOwned(userId, categoryId))?.pocketId ?? null;
  }

  /** Returns null when `externalId` was already recorded. */
  async function create(
    userId: string,
    input: NewTransaction,
    meta: { channel: Channel; externalId?: string },
  ): Promise<TransactionView | null> {
    await assertCategory(userId, input.categoryId);
    await pocketService.assertOwned(userId, input.pocketId);
    const categoryId =
      input.categoryId === undefined
        ? await cats.categoryForMerchant(userId, input.merchant)
        : input.categoryId;
    const pocketId =
      input.pocketId === undefined ? await pocketOfCategory(userId, categoryId) : input.pocketId;

    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        merchant: input.merchant,
        amount: input.amount,
        categoryId,
        pocketId,
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
            ilike(pockets.name, pattern),
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
      await pocketService.assertOwned(userId, changes.pocketId);
      const { occurredAt, ...rest } = changes;
      // Moving an expense to another category moves it to that category's pocket,
      // unless a pocket was chosen explicitly in the same change
      if (changes.categoryId !== undefined && changes.pocketId === undefined) {
        rest.pocketId = await pocketOfCategory(userId, changes.categoryId);
      }

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
      const result: QuickAddResult = {
        created: [],
        failed: [],
        unknownTags: [],
        unknownPockets: [],
        duplicates: 0,
      };

      for (const [index, line] of parseExpenseText(text).entries()) {
        if (!line.ok) {
          result.failed.push({ line: line.line, message: describeParseError(line.error) });
          continue;
        }

        const { merchant, amount, categoryTag, paymentMethod, pocketTag } = line.expense;
        let categoryId: string | undefined;
        if (categoryTag) {
          const category = await cats.resolveTag(userId, categoryTag);
          if (category) categoryId = category.id;
          else result.unknownTags.push(categoryTag);
        }
        let pocketId: string | undefined;
        if (pocketTag) {
          const pocket = await pocketService.resolveTag(userId, pocketTag);
          if (pocket) pocketId = pocket.id;
          else result.unknownPockets.push(pocketTag);
        }

        const created = await create(
          userId,
          {
            merchant,
            amount,
            categoryId,
            pocketId,
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
