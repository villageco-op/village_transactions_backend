import type { JWT } from '@auth/core/jwt';
import type { Session, User } from '@auth/core/types';

interface JWTParams {
  token: JWT;
  user?: User;
}

interface SessionParams {
  session: Session;
  token: JWT;
}

/**
 * Persists user information into the JWT token.
 * @param params - The callback parameters
 * @param params.token - The current JWT token
 * @param params.user - The user object (only available on initial sign in)
 * @returns The updated token
 */
export function jwtCallback({ token, user }: JWTParams) {
  if (user) {
    token.id = user.id;
  }

  return token;
}

/**
 * Links the JWT token data to the session object.
 * @param params - The callback parameters
 * @param params.session - The current session object
 * @param params.token - The current JWT token
 * @returns The updated session object
 */
export function sessionCallback({ session, token }: SessionParams) {
  if (session.user && token.id) {
    session.user.id = token.id;
  }

  return session;
}
