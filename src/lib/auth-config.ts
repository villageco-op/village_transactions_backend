import Google from '@auth/core/providers/google';
import Nodemailer from '@auth/core/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { AuthConfig } from '@hono/auth-js';

import { db } from '../db/index.js';
import { jwtCallback, sessionCallback } from '../services/auth/callbacks.js';

/**
 * Generates the configuration for Auth.js integration.
 * Defines the JWT strategy, Google and Nodemailer for passwordless authentication,
 * and the necessary session/JWT callbacks.
 * @returns The complete Auth.js configuration object
 */
export function getAuthConfig(): AuthConfig {
  return {
    secret: process.env.AUTH_SECRET,
    session: { strategy: 'jwt' },
    adapter: DrizzleAdapter(db),

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
