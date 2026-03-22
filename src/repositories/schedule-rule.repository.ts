import { eq, and } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { scheduleRules } from '../db/schema.js';
import type { DbClient, ScheduleType } from '../db/types.js';

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
    rules: { dayOfWeek: string; startTime: string; endTime: string; type: ScheduleType }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(scheduleRules).where(eq(scheduleRules.sellerId, sellerId));

      if (rules.length > 0) {
        await tx.insert(scheduleRules).values(
          rules.map((rule) => ({
            sellerId,
            dayOfWeek: rule.dayOfWeek,
            type: rule.type,
            startTime: rule.startTime,
            endTime: rule.endTime,
          })),
        );
      }
    });
  },

  /**
   * Fetches the seller's schedule bounds for a particular day of the week and fulfillment type.
   * @param sellerId - The unique identifier of the seller.
   * @param dayOfWeek - The case-insensitive name of the day (e.g., 'Monday').
   * @param type - The type of schedule (e.g., 'pickup' or 'delivery').
   * @returns A promise resolving to an array of schedule rules matching the criteria.
   */
  async getScheduleRules(sellerId: string, dayOfWeek: string, type: ScheduleType) {
    const rules = await this.db
      .select()
      .from(scheduleRules)
      .where(and(eq(scheduleRules.sellerId, sellerId), eq(scheduleRules.type, type)));

    return rules.filter((r) => r.dayOfWeek.toLowerCase() === dayOfWeek.toLowerCase());
  },
};
