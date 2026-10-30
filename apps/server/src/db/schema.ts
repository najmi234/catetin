import { CHANNELS, PAYMENT_METHODS } from '@catetin/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

// Column names are snake_cased by the `casing` option in db/client.ts and drizzle.config.ts.

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ── Better Auth core tables ─────────────────────────────

export const user = pgTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  ...timestamps,
});

export const session = pgTable('session', {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const account = pgTable('account', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  ...timestamps,
});

export const verification = pgTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ...timestamps,
});

// ── App tables ──────────────────────────────────────────

export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const channel = pgEnum('channel', CHANNELS);

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().$defaultFn(uuidv7),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text().notNull().default('#64748b'),
    icon: text().notNull().default('tag'),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [unique('categories_user_name_key').on(t.userId, t.name)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid().primaryKey().$defaultFn(uuidv7),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    merchant: text().notNull(),
    amount: bigint({ mode: 'number' }).notNull(),
    categoryId: uuid().references(() => categories.id, { onDelete: 'set null' }),
    paymentMethod: paymentMethod().notNull().default('cash'),
    channel: channel().notNull(),
    note: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Email Message-ID / WhatsApp message id — makes re-processing idempotent
    externalId: text().unique(),
    ...timestamps,
  },
  (t) => [
    index('transactions_user_occurred_idx').on(t.userId, t.occurredAt.desc()),
    check('transactions_amount_positive', sql`${t.amount} > 0`),
  ],
);

export const merchantRules = pgTable(
  'merchant_rules',
  {
    id: uuid().primaryKey().$defaultFn(uuidv7),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    merchantKey: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [unique('merchant_rules_user_key').on(t.userId, t.merchantKey)],
);

export const pushTokens = pgTable('push_tokens', {
  id: uuid().primaryKey().$defaultFn(uuidv7),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  ...timestamps,
});

export const appState = pgTable('app_state', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamps.updatedAt,
});
