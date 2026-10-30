import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import type { Db } from './db/client';
import * as schema from './db/schema';
import type { Logger } from './logger';

export interface AuthOptions {
  db: Db;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  ownerEmail: string;
  /** Delivers the login code; only ever called for the owner's address. */
  sendOtp: (email: string, otp: string) => Promise<void>;
  logger: Logger;
}

export function createAuth(options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, { provider: 'pg', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: '/api/auth',
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 days — a phone app should rarely ask to log in again
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      emailOTP({
        // The owner account is created at startup (services.ensureOwner)
        disableSignUp: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') return;
          if (email.toLowerCase() !== options.ownerEmail) {
            // Answer like a success so the endpoint does not reveal who the owner is
            options.logger.warn({ email }, 'OTP requested for a non-owner email — ignored');
            return;
          }
          await options.sendOtp(email, otp);
        },
      }),
      expo(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function sessionUserId(auth: Auth, request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}
