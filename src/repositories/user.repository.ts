import { eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { users } from '../db/schema.js';
import type { DbClient, User } from '../db/types.js';

export const userRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves a user from the database by their email address.
   * @param email - The unique email address to search for
   * @returns The user object if found, otherwise null
   */
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    return user ?? null;
  },
};
