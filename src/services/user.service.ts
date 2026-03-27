import { HTTPException } from 'hono/http-exception';

import { userRepository } from '../repositories/user.repository.js';

/**
 * Retrieves the current user profile, handles missing users, and sanitizes data.
 * @param id - User's unique ID injected by Auth.js session
 * @returns Sanitized user profile data
 */
export async function getCurrentUser(id: string) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;

  return safeUser;
}
