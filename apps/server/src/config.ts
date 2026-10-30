import { existsSync } from 'node:fs';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** 127.0.0.1 behind Caddy; 0.0.0.0 to reach the dev server from a phone on the LAN. */
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET minimal 32 karakter'),
  BETTER_AUTH_URL: z.url(),
  /** Comma-separated extra origins, e.g. "catetin://,exp://192.168.1.10:8081" */
  TRUSTED_ORIGINS: z.string().default('catetin://'),
  OWNER_EMAIL: z.email().transform((v) => v.toLowerCase()),
  OWNER_NAME: z.string().default('Owner'),

  /** Gmail account: IMAP for Mandiri notifications, SMTP for login OTP. */
  EMAIL: z.email().optional(),
  EMAIL_PASSWORD: z.string().optional(),

  GMAIL_ENABLED: bool.default(true),
  GMAIL_POLL_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),

  WA_ENABLED: bool.default(true),
  WA_AUTH_DIR: z.string().default('./data/auth_session'),
  /** Self-chat JID: MY_LID is preferred over MY_PHONE (see the old recorder). */
  MY_LID: z.string().optional(),
  MY_PHONE: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Konfigurasi .env tidak valid:\n${issues.join('\n')}`);
  }

  const config = parsed.data;
  if (config.GMAIL_ENABLED && !(config.EMAIL && config.EMAIL_PASSWORD)) {
    throw new Error('GMAIL_ENABLED=true membutuhkan EMAIL dan EMAIL_PASSWORD');
  }
  return config;
}
