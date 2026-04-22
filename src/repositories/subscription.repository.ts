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

    const baseConditions = [];

    if (buyerId) baseConditions.push(eq(subscriptions.buyerId, buyerId));
    if (sellerId) baseConditions.push(eq(produce.sellerId, sellerId));
    if (productId) baseConditions.push(eq(subscriptions.productId, productId));

    if (!buyerId && !sellerId) {
      baseConditions.push(
        or(eq(subscriptions.buyerId, requestingUserId), eq(produce.sellerId, requestingUserId)),
      );
    }

    const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;

    const fullWhere = status ? and(...baseConditions, eq(subscriptions.status, status)) : baseWhere;

    const activeWhere =
      baseConditions.length > 0
        ? and(...baseConditions, eq(subscriptions.status, 'active'))
        : eq(subscriptions.status, 'active');

    const [[totalResult], [activeResult], data] = await Promise.all([
      // Count for the current applied filters (used for pagination)
      this.db
        .select({ value: count() })
        .from(subscriptions)
        .innerJoin(produce, eq(subscriptions.productId, produce.id))
        .where(fullWhere),

      // Count for active subscriptions under the base filters
      this.db
        .select({ value: count() })
        .from(subscriptions)
        .innerJoin(produce, eq(subscriptions.productId, produce.id))
        .where(activeWhere),

      // The actual paginated data request
      baseQuery.where(fullWhere).orderBy(desc(subscriptions.createdAt)).limit(limit).offset(offset),
    ]);

    return {
      data,
      total: Number(totalResult.value),
      activeCount: Number(activeResult.value),
    };
  },

  /**
   * Persists general updates to a subscription in the database.
   * @param subscriptionId - The subscription ID
   * @param data - New values for fields
   * @param data.status - New subscription status
   * @param data.quantityOz - New order quantity
   * @param data.fulfillmentType - New fulfillment type
   * @param data.cancelReason - The cancel reason if status was updated to canceled or paused
   * @returns The updated subscription
   */
  async updateSubscriptionData(
    subscriptionId: string,
    data: {
      status?: 'active' | 'paused' | 'canceled';
      quantityOz?: number;
      fulfillmentType?: 'pickup' | 'delivery';
      cancelReason?: string;
    },
  ) {
    const updatePayload: {
      status?: 'active' | 'paused' | 'canceled';
      quantityOz?: string;
      fulfillmentType?: 'pickup' | 'delivery';
      cancelReason?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (data.status) updatePayload.status = data.status;
    if (data.quantityOz) updatePayload.quantityOz = data.quantityOz.toString();
    if (data.fulfillmentType) updatePayload.fulfillmentType = data.fulfillmentType;
    if (data.cancelReason !== undefined) updatePayload.cancelReason = data.cancelReason;

    const [updated] = await this.db
      .update(subscriptions)
      .set(updatePayload)
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    return updated;
  },

  /**
   * Fetches subscriptions for a specific product filtered by multiple statuses.
   * @param productId - The unique ID of the product.
   * @param statuses - An array of statuses to include (e.g., ['active', 'paused']).
   * @returns A list of subscriptions that include the product
   */
  async getSubscriptionsByProduct(
    productId: string,
    statuses: ('active' | 'paused' | 'canceled')[],
  ) {
    return await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.productId, productId), inArray(subscriptions.status, statuses)));
  },
};
