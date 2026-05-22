import Google from '@auth/core/providers/google';
import Nodemailer from '@auth/core/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { AuthConfig } from '@hono/auth-js';

import { db } from '../db/index.js';
import { users, accounts, sessions, verificationTokens } from '../db/schema.js';
import { jwtCallback, sessionCallback } from '../services/auth/callbacks.js';

/**
 * Generates the configuration for Auth.js integration.
 * Defines the JWT strategy, Google and Nodemailer for passwordless authentication,
 * and the necessary session/JWT callbacks.
 * @returns The complete Auth.js configuration object
 */
export function getAuthConfig(): AuthConfig {
  const isProdOrPreview =
    process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
  const cookieDomain = isProdOrPreview ? '.villageco-op.com' : undefined;

  return {
    secret: process.env.AUTH_SECRET,
    session: { strategy: 'jwt' },
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    trustHost: true,
    basePath: '/api/auth',

    cookies: {
      pkceCodeVerifier: {
        name: `__Secure-authjs.pkce.code_verifier`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: true,
          domain: cookieDomain,
        },
      },
      state: {
        name: `__Secure-authjs.state`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: true,
          domain: cookieDomain,
        },
      },
    },

    providers: [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      Nodemailer({
        server: process.env.EMAIL_SERVER,
        from: process.env.EMAIL_FROM,
      }),
    ],

    callbacks: {
      jwt: jwtCallback,
      session: sessionCallback,
    },
  };
}
