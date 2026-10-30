import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appState } from '../db/schema';

/** Small key/value store for process state that must survive restarts. */
export function createAppStateService(db: Db) {
  return {
    async get<T>(key: string): Promise<T | null> {
      const [row] = await db.select().from(appState).where(eq(appState.key, key));
      return (row?.value as T | undefined) ?? null;
    },

    async set(key: string, value: unknown): Promise<void> {
      await db
        .insert(appState)
        .values({ key, value })
        .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
    },
  };
}

export type AppStateService = ReturnType<typeof createAppStateService>;
