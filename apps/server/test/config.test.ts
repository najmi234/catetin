import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

const required = {
  DATABASE_URL: 'postgres://catetin:x@127.0.0.1:5432/catetin',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3001',
  OWNER_EMAIL: 'Owner@Example.com',
};

describe('parseConfig', () => {
  it('treats blank optional values as unset, like .env.example leaves them', () => {
    const config = parseConfig({
      ...required,
      EMAIL: '',
      EMAIL_PASSWORD: '',
      MY_LID: '',
      MY_PHONE: '',
      GMAIL_ENABLED: 'false',
      WA_ENABLED: 'false',
    });
    expect(config.EMAIL).toBeUndefined();
    expect(config.MY_LID).toBeUndefined();
    expect(config.OWNER_EMAIL).toBe('owner@example.com');
  });

  it('applies defaults', () => {
    expect(parseConfig({ ...required, GMAIL_ENABLED: 'false' })).toMatchObject({
      HOST: '127.0.0.1',
      PORT: 3001,
      WA_ENABLED: true,
      GMAIL_POLL_INTERVAL_MS: 60_000,
    });
  });

  it('names every invalid key', () => {
    expect(() => parseConfig({ ...required, EMAIL: 'bukan-email', PORT: 'abc' })).toThrow(
      /EMAIL[\s\S]*PORT|PORT[\s\S]*EMAIL/,
    );
  });

  it('requires Gmail credentials when the poller is on', () => {
    expect(() => parseConfig({ ...required, GMAIL_ENABLED: 'true' })).toThrow(
      'GMAIL_ENABLED=true membutuhkan EMAIL dan EMAIL_PASSWORD',
    );
  });
});
