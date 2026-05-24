import { eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const sessionRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Deletes all active database sessions for a user, forcefully logging them out across devices.
   * @param userId - The targeted user ID
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  },
};
