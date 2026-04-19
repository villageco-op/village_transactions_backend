import { eq, and, inArray, count, desc, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db as defaultDb } from '../db/index.js';
import { produce, subscriptions, users } from '../db/schema.js';
import type { DbClient, Subscription } from '../db/types.js';
import type { GetSubscriptionsQuery } from '../schemas/subscription.schema.js';

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

  /**
   * Retrieves a subscription with its associated product details to determine the seller.
   * @param subscriptionId - The UUID of the subscription.
   * @returns The combined subscription and product object, including sellerId, or null.
   */
  async getSubscriptionDetailsById(subscriptionId: string) {
    const [result] = await this.db
      .select({
        subscription: subscriptions,
        product: produce,
      })
      .from(subscriptions)
      .innerJoin(produce, eq(subscriptions.productId, produce.id))
      .where(eq(subscriptions.id, subscriptionId));

    if (!result) return null;

    return {
      ...result.subscription,
      product: result.product,
      sellerId: result.product.sellerId,
    };
  },

  /**
   * Dynamically query, filter, and paginate subscriptions.
   * Joins produce, buyer, and seller natively for optimal performance.
   * @param requestingUserId - The ID of the calling user
   * @param query - The filters for the query
   * @param offset - Pagination offset
   * @returns A list of subscriptions and the total subscriptions
   */
  async querySubscriptions(requestingUserId: string, query: GetSubscriptionsQuery, offset: number) {
    const { buyerId, sellerId, productId, status, limit } = query;

    // Create table aliases for self-joining the users table
    const buyers = alias(users, 'buyers');
    const sellers = alias(users, 'sellers');

    const baseQuery = this.db
      .select({
        subscription: subscriptions,
        product: produce,
        buyer: buyers,
        seller: sellers,
      })
      .from(subscriptions)
      .innerJoin(produce, eq(subscriptions.productId, produce.id))
      .leftJoin(buyers, eq(subscriptions.buyerId, buyers.id))
      .leftJoin(sellers, eq(produce.sellerId, sellers.id));

    // Dynamic conditions based on user input
    const conditions = [];

    if (buyerId) conditions.push(eq(subscriptions.buyerId, buyerId));
    if (sellerId) conditions.push(eq(produce.sellerId, sellerId));
    if (productId) conditions.push(eq(subscriptions.productId, productId));
    if (status) conditions.push(eq(subscriptions.status, status));

    // Crucial Security Layer: If neither buyerId nor sellerId is explicitly asked for,
    // restrict results to ONLY rows where the requesting user is EITHER the buyer or the seller.
    if (!buyerId && !sellerId) {
      conditions.push(
        or(eq(subscriptions.buyerId, requestingUserId), eq(produce.sellerId, requestingUserId)),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db
      .select({ value: count() })
      .from(subscriptions)
      .innerJoin(produce, eq(subscriptions.productId, produce.id))
      .where(whereClause);

    const data = await baseQuery
      .where(whereClause)
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total: Number(totalResult.value),
    };
  },
};
