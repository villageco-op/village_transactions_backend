import { authenticateUser } from '../auth.service.js';

/**
 * Authorizes a user based on provided credentials.
 * @param credentials - Object containing email and password
 * @returns The authenticated user or null if validation fails
 */
export async function authorize(credentials: Partial<Record<'email' | 'password', unknown>>) {
  const email = credentials?.email;
  const password = credentials?.password;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }

  return authenticateUser(email, password);
}
