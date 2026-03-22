import { eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { scheduleRules } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const scheduleRuleRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Replaces the entire weekly schedule for a specific seller.
   * @param sellerId - The unique user/seller ID
   * @param rules - An array of formatted schedule rules
   */
  async replaceSellerRules(
    sellerId: string,
    rules: { dayOfWeek: string; startTime: string; endTime: string }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(scheduleRules).where(eq(scheduleRules.sellerId, sellerId));

      if (rules.length > 0) {
        await tx.insert(scheduleRules).values(
          rules.map((rule) => ({
            sellerId,
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
          })),
        );
      }
    });
  },
};
