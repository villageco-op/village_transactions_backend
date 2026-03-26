import { and, eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { reviews } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const reviewRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Inserts a new review into the database.
   * @param data - The review data to insert (inferred from schema)
   * @returns The created review object, or null if the insertion failed
   */
  async create(data: typeof reviews.$inferInsert) {
    const [review] = await this.db.insert(reviews).values(data).returning();
    return review ?? null;
  },

  /**
   * Finds a review by a specific buyer for a specific order.
   * @param orderId - The unique identifier of the order
   * @param buyerId - The unique identifier of the buyer
   * @returns The review object if found, otherwise null
   */
  async findByOrderAndBuyer(orderId: string, buyerId: string) {
    const [review] = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.orderId, orderId), eq(reviews.buyerId, buyerId)))
      .limit(1);

    return review ?? null;
  },
};
