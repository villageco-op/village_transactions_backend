import Credentials from '@auth/core/providers/credentials';
import type { AuthConfig } from '@hono/auth-js';

import { authorize } from '../services/auth/authorize.js';
import { jwtCallback, sessionCallback } from '../services/auth/callbacks.js';

/**
 * Generates the configuration for Auth.js integration.
 * Defines the JWT strategy, credential provider for email/password login,
 * and the necessary session/JWT callbacks.
 * @returns The complete Auth.js configuration object
 */
export function getAuthConfig(): AuthConfig {
  return {
    secret: process.env.AUTH_SECRET,
    session: { strategy: 'jwt' },

    providers: [
      Credentials({
        name: 'Credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        authorize,
      }),
    ],

    callbacks: {
      jwt: jwtCallback,
      session: sessionCallback,
    },
  };
}
