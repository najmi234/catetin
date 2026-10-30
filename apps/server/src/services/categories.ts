import type { CategoryInput } from '@catetin/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, merchantRules } from '../db/schema';
import type { EventBus } from './events';

export type Category = typeof categories.$inferSelect;

export const DEFAULT_CATEGORIES = [
  { name: 'Makanan & Minuman', color: '#f59e0b', icon: 'utensils' },
  { name: 'Transportasi', color: '#3b82f6', icon: 'car' },
  { name: 'Belanja', color: '#ec4899', icon: 'shopping-bag' },
  { name: 'Tagihan', color: '#ef4444', icon: 'receipt' },
  { name: 'Hiburan', color: '#8b5cf6', icon: 'film' },
  { name: 'Kesehatan', color: '#10b981', icon: 'heart-pulse' },
  { name: 'Pengembangan Diri', color: '#4f46e5', icon: 'book-open' },
  { name: 'Lainnya', color: '#64748b', icon: 'tag' },
] as const;

/** "Makanan & Minuman" → "makananminuman", used to match "#makan" tags. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Key for remembering a merchant's category: "  KOPI  Kenangan!" → "kopi kenangan". */
export function merchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class CategoryNameTakenError extends Error {
  constructor() {
    super('Nama kategori sudah dipakai');
  }
}

export function createCategoryService(db: Db, events: EventBus) {
  async function list(userId: string): Promise<Category[]> {
    return db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async function findOwned(userId: string, id: string): Promise<Category | null> {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id)));
    return row ?? null;
  }

  async function guardUniqueName<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (isUniqueViolation(err)) throw new CategoryNameTakenError();
      throw err;
    }
  }

  return {
    list,
    findOwned,

    async seedDefaults(userId: string): Promise<void> {
      await db
        .insert(categories)
        .values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId, sortOrder: i })))
        .onConflictDoNothing();
    },

    async create(userId: string, input: CategoryInput): Promise<Category> {
      const [{ next } = { next: 0 }] = await db
        .select({ next: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int + 1` })
        .from(categories)
        .where(eq(categories.userId, userId));
      const [row] = await guardUniqueName(() =>
        db
          .insert(categories)
          .values({ ...input, userId, sortOrder: next })
          .returning(),
      );
      events.publish(userId, { type: 'categories.changed' });
      return row!;
    },

    async update(
      userId: string,
      id: string,
      input: Partial<CategoryInput> & { sortOrder?: number },
    ): Promise<Category | null> {
      const [row] = await guardUniqueName(() =>
        db
          .update(categories)
          .set(input)
          .where(and(eq(categories.userId, userId), eq(categories.id, id)))
          .returning(),
      );
      if (row) events.publish(userId, { type: 'categories.changed' });
      return row ?? null;
    },

    /** Transactions keep existing with no category (FK is ON DELETE SET NULL). */
    async remove(userId: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(categories)
        .where(and(eq(categories.userId, userId), eq(categories.id, id)))
        .returning({ id: categories.id });
      if (deleted.length > 0) events.publish(userId, { type: 'categories.changed' });
      return deleted.length > 0;
    },

    /**
     * Resolve a "#tag" to a category: exact normalized name first, then a unique prefix
     * ("#makan" → "Makanan & Minuman"). Returns null when unknown or ambiguous.
     */
    async resolveTag(userId: string, tag: string): Promise<Category | null> {
      const wanted = normalizeName(tag);
      if (!wanted) return null;
      const all = await list(userId);
      const exact = all.find((c) => normalizeName(c.name) === wanted);
      if (exact) return exact;
      const prefixed = all.filter((c) => normalizeName(c.name).startsWith(wanted));
      return prefixed.length === 1 ? prefixed[0]! : null;
    },

    async categoryForMerchant(userId: string, merchant: string): Promise<string | null> {
      const [rule] = await db
        .select({ categoryId: merchantRules.categoryId })
        .from(merchantRules)
        .where(
          and(
            eq(merchantRules.userId, userId),
            eq(merchantRules.merchantKey, merchantKey(merchant)),
          ),
        );
      return rule?.categoryId ?? null;
    },

    /** Remember the latest category the user chose for a merchant. */
    async learnMerchant(userId: string, merchant: string, categoryId: string): Promise<void> {
      const key = merchantKey(merchant);
      if (!key) return;
      await db
        .insert(merchantRules)
        .values({ userId, merchantKey: key, categoryId })
        .onConflictDoUpdate({
          target: [merchantRules.userId, merchantRules.merchantKey],
          set: { categoryId, updatedAt: new Date() },
        });
    },
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;

export function isUniqueViolation(err: unknown): boolean {
  // postgres-js and PGlite both expose the SQLSTATE as `code`; drizzle may wrap it in `cause`
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
