import { HTTPException } from 'hono/http-exception';

import { userRepository } from '../repositories/user.repository.js';
import type { UpdateUserPayload } from '../schemas/user.schema.js';

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

/**
 * Updates the current user profile with new information.
 * @param id - User's unique ID injected by Auth.js session
 * @param data - The new profile data payload from the request body
 * @returns Sanitized updated user profile data
 */
export async function updateCurrentUser(id: string, data: UpdateUserPayload) {
  const updatedUser = await userRepository.updateById(id, data);

  if (!updatedUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const { passwordHash: _passwordHash, ...safeUser } = updatedUser;

  return safeUser;
}
