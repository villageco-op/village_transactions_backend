import { and, eq, gte, lt, ne } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orders } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const availabilityRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Fetches all scheduled active (non-canceled) orders for a seller within a date span.
   * @param sellerId - The unique identifier of the seller.
   * @param startOfDay - The start boundary Date object.
   * @param endOfDay - The end boundary Date object.
   * @returns A promise resolving to an array of objects containing the scheduled times of active orders.
   */
  async getActiveOrders(sellerId: string, startOfDay: Date, endOfDay: Date) {
    return await this.db
      .select({ scheduledTime: orders.scheduledTime })
      .from(orders)
      .where(
        and(
          eq(orders.sellerId, sellerId),
          gte(orders.scheduledTime, startOfDay),
          lt(orders.scheduledTime, endOfDay),
          ne(orders.status, 'canceled'),
        ),
      );
  },
};
