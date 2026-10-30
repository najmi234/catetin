import { APP_TIME_ZONE, monthRange } from '@catetin/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, transactions } from '../db/schema';

export interface MonthSummary {
  month: string;
  total: number;
  count: number;
  /** Days with at least one transaction. */
  activeDays: number;
  averagePerActiveDay: number;
  daily: { day: number; total: number; count: number }[];
  byCategory: {
    categoryId: string | null;
    name: string;
    color: string;
    icon: string;
    total: number;
    count: number;
  }[];
}

export function createSummaryService(db: Db) {
  return {
    async month(userId: string, month: string): Promise<MonthSummary> {
      const range = monthRange(month);
      if (!range) throw new Error(`Bulan tidak valid: ${month}`);

      const inMonth = and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      );
      const wibDay = sql<number>`extract(day from ${transactions.occurredAt} at time zone ${sql.raw(`'${APP_TIME_ZONE}'`)})::int`;
      const total = sql<number>`sum(${transactions.amount})`.mapWith(Number);
      const count = sql<number>`count(*)::int`.mapWith(Number);

      const daily = await db
        .select({ day: wibDay, total, count })
        .from(transactions)
        .where(inMonth)
        .groupBy(wibDay)
        .orderBy(wibDay);

      const byCategory = await db
        .select({
          categoryId: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          total,
          count,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(inMonth)
        .groupBy(categories.id)
        .orderBy(desc(total));

      const monthTotal = daily.reduce((sum, d) => sum + d.total, 0);
      const monthCount = daily.reduce((sum, d) => sum + d.count, 0);
      return {
        month,
        total: monthTotal,
        count: monthCount,
        activeDays: daily.length,
        averagePerActiveDay: daily.length > 0 ? Math.round(monthTotal / daily.length) : 0,
        daily,
        byCategory: byCategory.map((c) => ({
          ...c,
          name: c.name ?? 'Tanpa kategori',
          color: c.color ?? '#94a3b8',
          icon: c.icon ?? 'circle-help',
        })),
      };
    },
  };
}

export type SummaryService = ReturnType<typeof createSummaryService>;
