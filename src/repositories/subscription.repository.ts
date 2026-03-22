import { eq, and } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { subscriptions } from '../db/schema.js';
import type { DbClient, Subscription } from '../db/types.js';

export const subscriptionRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves a subscription by its ID, scoped to a specific buyer.
   * @param buyerId - The ID of the buyer who owns the subscription.
   * @param subscriptionId - The unique ID of the subscription.
   * @returns The subscription object if found, otherwise null.
   */
  async getBuyerSubscription(
    buyerId: string,
    subscriptionId: string,
  ): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.buyerId, buyerId)));
    return subscription ?? null;
  },

  /**
   * Persists a status update for a subscription in the database.
   * @param subscriptionId - The unique ID of the subscription to update.
   * @param status - The new status to be set.
   * @returns The newly updated subscription record.
   */
  async updateStatus(subscriptionId: string, status: 'active' | 'paused' | 'canceled') {
    const [updated] = await this.db
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return updated;
  },
};
