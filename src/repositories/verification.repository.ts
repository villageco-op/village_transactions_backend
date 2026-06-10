import { eq, desc } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { verificationTokens } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const verificationRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves the latest active verification token for a given email identifier.
   * @param email - The email
   * @returns The token/link or null
   */
  async findLatestByEmail(email: string) {
    const [tokenRecord] = await this.db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, email))
      .orderBy(desc(verificationTokens.expires))
      .limit(1);

    return tokenRecord ?? null;
  },
};
