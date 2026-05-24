import { eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { accounts } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const accountRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Forcefully removes all linked OAuth accounts (providers) for a user.
   * Crucial for destroying third-party links during hard or soft account wipes.
   * @param userId - The targeted user ID
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(accounts).where(eq(accounts.userId, userId));
  },
};
