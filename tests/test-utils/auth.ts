import { encode } from '@auth/core/jwt';
import { request } from './request.js';

/**
 * Generates a signed Auth.js session cookie using a mock JWT.
 * @param userOverride - Optional partial user object to customize the token payload
 * @returns A formatted Set-Cookie string containing the signed JWT
 */
export async function getTestAuthCookie(
  userOverride: Partial<{ id: string; email: string; name: string; image: string | null }> = {},
) {
  const authSecret =
    process.env.AUTH_SECRET || 'super-secret-test-key-that-is-at-least-32-chars-long';

  const mockUser = {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    image: null,
    ...userOverride,
  };

  const tokenPayload = {
    name: mockUser.name,
    email: mockUser.email,
    picture: mockUser.image,
    sub: mockUser.id,
    id: mockUser.id,
  };

  const cookieName = 'authjs.session-token';

  const token = await encode({
    token: tokenPayload,
    secret: authSecret,
    salt: cookieName,
  });

  return `${cookieName}=${token}`;
}

/**
 * A wrapper for the app request utility that automatically injects an authentication cookie.
 * @param path - The API endpoint path
 * @param options - Standard RequestInit options (headers, body, method)
 * @param userOverride - Optional user data to bake into the auth cookie
 * @returns The response from the Hono app
 */
export async function authedRequest(
  path: string,
  options: RequestInit = {},
  userOverride?: Parameters<typeof getTestAuthCookie>[0],
) {
  const cookie = await getTestAuthCookie(userOverride);
  const headers = new Headers(options.headers);

  const existingCookie = headers.get('Cookie');
  headers.set('Cookie', existingCookie ? `${existingCookie}; ${cookie}` : cookie);

  return request(path, {
    ...options,
    headers: Object.fromEntries(headers.entries()),
  });
}
