import bcrypt from 'bcryptjs';

import { userRepository } from '../repositories/index.js';

/**
 * Validates user credentials and returns a sanitized user object.
 * @param email - User's email address
 * @param password - Plain text password to verify
 * @returns Sanitized user data if successful, otherwise null
 */
export async function authenticateUser(email: string, password: string) {
  const user = await userRepository.findByEmail(email);

  if (!user || !user.passwordHash) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}
