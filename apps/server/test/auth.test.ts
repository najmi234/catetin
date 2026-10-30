import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api';
import { createAuth, sessionUserId } from '../src/auth';
import { createServices } from '../src/services';
import { createTestDb, silentLogger } from './helpers';

const BASE_URL = 'http://localhost:3001';
const OWNER = 'owner@example.com';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof createApp>;
const sent: { email: string; otp: string }[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
  const services = createServices(testDb.db);
  await services.ensureOwner(OWNER, 'Owner');
  const auth = createAuth({
    db: testDb.db,
    secret: 'test-secret-test-secret-test-secret-123',
    baseURL: BASE_URL,
    trustedOrigins: ['catetin://'],
    ownerEmail: OWNER,
    sendOtp: async (email, otp) => {
      sent.push({ email, otp });
    },
    logger: silentLogger,
  });
  app = createApp({
    db: testDb.db,
    services,
    logger: silentLogger,
    getUserId: (request) => sessionUserId(auth, request),
    authHandler: (request) => auth.handler(request),
  });
});
afterAll(() => testDb.close());

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify(body),
  });
}

describe('email OTP login', () => {
  it('logs the owner in and opens the API', async () => {
    const requested = await post('/api/auth/email-otp/send-verification-otp', {
      email: OWNER,
      type: 'sign-in',
    });
    expect(requested.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.otp).toMatch(/^\d{6}$/);

    const signedIn = await post('/api/auth/sign-in/email-otp', { email: OWNER, otp: sent[0]!.otp });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0]!;

    const res = await app.request('/api/transactions?month=2026-07', { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it('never sends a code to, or signs in, anyone else', async () => {
    sent.length = 0;
    const requested = await post('/api/auth/email-otp/send-verification-otp', {
      email: 'stranger@example.com',
      type: 'sign-in',
    });
    expect(requested.status).toBe(200);
    expect(sent).toEqual([]);

    const signedIn = await post('/api/auth/sign-in/email-otp', {
      email: 'stranger@example.com',
      otp: '000000',
    });
    expect(signedIn.ok).toBe(false);
  });

  it('rejects a wrong code', async () => {
    await post('/api/auth/email-otp/send-verification-otp', { email: OWNER, type: 'sign-in' });
    const signedIn = await post('/api/auth/sign-in/email-otp', { email: OWNER, otp: '000000' });
    expect(signedIn.ok).toBe(false);
  });
});
