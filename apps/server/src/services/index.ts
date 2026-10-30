import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Db } from '../db/client';
import { user } from '../db/schema';
import { createAppStateService } from './app-state';
import { createCategoryService } from './categories';
import { EventBus } from './events';
import { createSummaryService } from './summary';
import { createTransactionService } from './transactions';

export function createServices(db: Db) {
  const events = new EventBus();
  const categories = createCategoryService(db, events);
  return {
    events,
    appState: createAppStateService(db),
    categories,
    transactions: createTransactionService(db, events, categories),
    summary: createSummaryService(db),

    /**
     * Single-user app: the owner account exists before anyone logs in, so WhatsApp
     * and Gmail entries have a user to belong to. Sign-up is disabled in auth.ts.
     */
    async ensureOwner(email: string, name: string): Promise<string> {
      const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
      if (existing) return existing.id;

      const id = uuidv7();
      await db.insert(user).values({ id, email, name });
      await categories.seedDefaults(id);
      return id;
    },
  };
}

export type Services = ReturnType<typeof createServices>;
