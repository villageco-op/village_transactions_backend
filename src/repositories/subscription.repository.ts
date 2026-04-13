import { eq, and, inArray } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { produce, subscriptions } from '../db/schema.js';
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

  /**
   * Retrieves all active subscriptions for a specific buyer, including produce details.
   * @param buyerId - The ID of the buyer.
   * @returns An array of active subscriptions.
   */
  async getActiveSubscriptionsForBuyer(buyerId: string) {
    return await this.db
      .select({
        id: subscriptions.id,
        produceName: produce.title,
        amount: subscriptions.quantityOz,
      })
      .from(subscriptions)
      .innerJoin(produce, eq(subscriptions.productId, produce.id))
      .where(and(eq(subscriptions.buyerId, buyerId), eq(subscriptions.status, 'active')));
  },

  /**
   * Retrieves active subscriptions for an array of product IDs to calculate analytics.
   * @param productIds - Array of product IDs
   * @returns The active subscriptions for the given products
   */
  async getActiveSubscriptionsForProducts(productIds: string[]) {
    if (!productIds.length) return [];
    return await this.db
      .select({
        productId: subscriptions.productId,
        quantityOz: subscriptions.quantityOz,
        nextDeliveryDate: subscriptions.nextDeliveryDate,
      })
      .from(subscriptions)
      .where(and(inArray(subscriptions.productId, productIds), eq(subscriptions.status, 'active')));
  },
};
