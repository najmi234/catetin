import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { pino } from 'pino';
import { createApp } from '../src/api';
import { MIGRATIONS_FOLDER, type Db } from '../src/db/client';
import * as schema from '../src/db/schema';
import { createServices } from '../src/services';

export const silentLogger = pino({ level: 'silent' });

/** A migrated in-memory Postgres per test file. */
export async function createTestDb() {
  const client = new PGlite();
  const pg = drizzle({ client, schema, casing: 'snake_case' });
  await migrate(pg, { migrationsFolder: MIGRATIONS_FOLDER });
  const db = pg as unknown as Db;

  return {
    db,
    async reset() {
      await db.execute(sql`truncate "user", app_state cascade`);
    },
    close: () => client.close(),
  };
}

/** Services plus two users, so tests can check that data does not leak between them. */
export async function setup(db: Db) {
  const services = createServices(db);
  const owner = await services.ensureOwner('owner@example.com', 'Owner');
  const other = await services.ensureOwner('other@example.com', 'Other');
  return { services, owner, other };
}

export function createTestApp(db: Db, services: ReturnType<typeof createServices>) {
  return createApp({
    db,
    services,
    logger: silentLogger,
    // Tests authenticate with "x-test-user: <userId>"
    getUserId: async (request) => request.headers.get('x-test-user'),
    sseHeartbeatSeconds: 1,
  });
}
