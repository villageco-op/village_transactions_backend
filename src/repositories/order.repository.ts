import { eq, inArray, and, gt, desc, gte, sql, lt, notInArray } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import {
  cartReservations,
  orders,
  orderItems,
  produce,
  subscriptions,
  users,
  cartGroups,
} from '../db/schema.js';
import type { DbClient, OrderStatus } from '../db/types.js';

export const orderRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Transforms temporary cart reservations into official Orders, deducts inventory,
   * and initializes subscriptions.
   * @remarks
   * This process is designed to be idempotent and safe, running entirely within a
   * single SQL transaction. It validates that reservations exist and have not expired
   * before proceeding.
   * @param payload - The fulfillment details.
   * @param payload.buyerId - ID of the purchasing user.
   * @param payload.sellerId - ID of the seller fulfilling the order.
   * @param payload.stripeSessionId - The unique ID from the Stripe Checkout session.
   * @param payload.stripeSubscriptionId - The ID of the Stripe recurring subscription (if applicable).
   * @param payload.stripeReceiptUrl - The receipt url for the order.
   * @param payload.totalAmount - Total order value in dollars.
   * @param payload.fulfillmentType - Whether the order is for 'pickup' or 'delivery'.
   * @param payload.scheduledTime - The intended date/time for fulfillment.
   * @param payload.reservationIds - Array of UUIDs representing the cart items to fulfill.
   * @throws {Error} "Reservations expired or not found." - If any ID is missing or `expiresAt` < now.
   * @returns The newly created Order object.
   */
  async fulfillCheckoutSession(payload: {
    buyerId: string;
    sellerId: string;
    stripeSessionId: string;
    stripeSubscriptionId?: string;
    stripeReceiptUrl: string;
    totalAmount: number;
    fulfillmentType: 'pickup' | 'delivery';
    scheduledTime: Date;
    reservationIds: string[];
  }) {
    if (!payload.reservationIds || payload.reservationIds.length === 0) {
      throw new Error('Reservations expired or not found.');
    }

    return await this.db.transaction(async (tx) => {
      // Fetch reserved items AND join their cart group to check subscription status
      const reservedItems = await tx
        .select({
          reservation: cartReservations,
          group: cartGroups,
          product: produce,
        })
        .from(cartReservations)
        .innerJoin(cartGroups, eq(cartReservations.groupId, cartGroups.id))
        .innerJoin(produce, eq(cartReservations.productId, produce.id))
        .where(
          and(
            inArray(cartReservations.id, payload.reservationIds),
            gt(cartReservations.expiresAt, new Date()),
          ),
        );

      if (reservedItems.length === 0) {
        throw new Error('Reservations expired or not found.');
      }

      // Create the Order
      const [newOrder] = await tx
        .insert(orders)
        .values({
          buyerId: payload.buyerId,
          sellerId: payload.sellerId,
          stripeSessionId: payload.stripeSessionId,
          stripeReceiptUrl: payload.stripeReceiptUrl,
          paymentMethod: 'card',
          fulfillmentType: payload.fulfillmentType,
          scheduledTime: payload.scheduledTime,
          totalAmount: payload.totalAmount.toString(),
          status: 'paid',
        })
        .returning();

      // Process each item
      for (const { reservation, group, product } of reservedItems) {
        // Record the purchased item
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          productId: product.id,
          quantityOz: reservation.quantityOz,
          pricePerOz: product.pricePerOz,
        });

        // Initialize subscription if the group this item belonged to was a subscription
        if (group.isSubscription) {
          const nextDeliveryDate = new Date(payload.scheduledTime);
          nextDeliveryDate.setDate(nextDeliveryDate.getDate() + product.harvestFrequencyDays);

          await tx.insert(subscriptions).values({
            buyerId: payload.buyerId,
            productId: product.id,
            stripeSubscriptionId: payload.stripeSubscriptionId,
            quantityOz: reservation.quantityOz,
            fulfillmentType: payload.fulfillmentType,
            nextDeliveryDate,
          });
        }

        // Deduct Inventory
        const newInventory = Math.max(
          0,
          Number(product.totalOzInventory) - Number(reservation.quantityOz),
        );
        await tx
          .update(produce)
          .set({ totalOzInventory: newInventory.toString() })
          .where(eq(produce.id, product.id));
      }

      // Delete the successfully purchased reservations
      await tx.delete(cartReservations).where(inArray(cartReservations.id, payload.reservationIds));

      return newOrder;
    });
  },

  /**
   * Processes a recurring Stripe invoice. Finds the matching internal subscription,
   * creates a new 'paid' order, deducts inventory, and advances the nextDeliveryDate.
   * @param payload - The data payload
   * @param payload.stripeSubscriptionId - The Stripe subscription Id
   * @param payload.stripeInvoiceId - The Stripe invoice Id
   * @param payload.stripeReceiptUrl - The Stripe receipt Url
   * @param payload.totalAmount - The total payment amount
   * @returns The new order created
   */
  async fulfillRecurringSubscription(payload: {
    stripeSubscriptionId: string;
    stripeInvoiceId: string;
    stripeReceiptUrl: string;
    totalAmount: number;
  }) {
    return await this.db.transaction(async (tx) => {
      // Check idempotency (did Stripe send this webhook twice?)
      const [existing] = await tx
        .select()
        .from(orders)
        .where(eq(orders.stripeInvoiceId, payload.stripeInvoiceId));
      if (existing) return existing;

      const [subRecord] = await tx
        .select({ sub: subscriptions, product: produce })
        .from(subscriptions)
        .innerJoin(produce, eq(subscriptions.productId, produce.id))
        .where(eq(subscriptions.stripeSubscriptionId, payload.stripeSubscriptionId));

      if (!subRecord) throw new Error('Subscription not found.');

      const { sub, product } = subRecord;

      const [newOrder] = await tx
        .insert(orders)
        .values({
          buyerId: sub.buyerId,
          sellerId: product.sellerId,
          stripeInvoiceId: payload.stripeInvoiceId,
          stripeReceiptUrl: payload.stripeReceiptUrl,
          paymentMethod: 'card',
          fulfillmentType: sub.fulfillmentType,
          scheduledTime: sub.nextDeliveryDate || new Date(),
          status: 'paid',
          totalAmount: payload.totalAmount.toString(),
        })
        .returning();

      await tx.insert(orderItems).values({
        orderId: newOrder.id,
        productId: product.id,
        quantityOz: sub.quantityOz,
        pricePerOz: product.pricePerOz,
      });

      const newInventory = Math.max(0, Number(product.totalOzInventory) - Number(sub.quantityOz));
      await tx
        .update(produce)
        .set({ totalOzInventory: newInventory.toString() })
        .where(eq(produce.id, product.id));

      // Advance the Subscription's next delivery date
      if (sub.nextDeliveryDate && product.harvestFrequencyDays) {
        const nextDate = new Date(sub.nextDeliveryDate);
        nextDate.setDate(nextDate.getDate() + product.harvestFrequencyDays);

        await tx
          .update(subscriptions)
          .set({ nextDeliveryDate: nextDate })
          .where(eq(subscriptions.id, sub.id));
      }

      return newOrder;
    });
  },

  /**
   * The "Janitor" worker function. Finds orders that are 'paid' but their
   * scheduled fulfillment time passed 24+ hours ago, and marks them 'completed'.
   * @returns The updated order
   */
  async autoCompletePassedOrders() {
    const bufferTime = new Date();
    bufferTime.setHours(bufferTime.getHours() - 24);

    return await this.db
      .update(orders)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(and(eq(orders.status, 'paid'), lt(orders.scheduledTime, bufferTime)))
      .returning();
  },

  /**
   * Retrieves an order by its unique identifier.
   * @param orderId - The UUID of the order to retrieve.
   * @returns The order object if found, otherwise null.
   */
  async getOrderById(orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));

    return order || null;
  },

  /**
   * Updates an order's status to 'canceled' and safely restocks the associated inventory.
   * @remarks
   * This operation runs within a single SQL transaction to guarantee data integrity.
   * If updating the inventory fails, the order status will not be altered.
   * @param orderId - The UUID of the order to cancel.
   * @param reason - The reason provided for cancellation.
   * @returns The newly canceled order object.
   */
  async updateOrderToCanceled(orderId: string, reason: string) {
    return await this.db.transaction(async (tx) => {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        const [product] = await tx
          .select({ id: produce.id, totalOzInventory: produce.totalOzInventory })
          .from(produce)
          .where(eq(produce.id, item.productId));

        if (product) {
          const newInventory = Number(product.totalOzInventory) + Number(item.quantityOz);

          await tx
            .update(produce)
            .set({ totalOzInventory: newInventory.toString() })
            .where(eq(produce.id, product.id));
        }
      }

      const [canceledOrder] = await tx
        .update(orders)
        .set({
          status: 'canceled',
          cancelReason: reason,
        })
        .where(eq(orders.id, orderId))
        .returning();

      return canceledOrder;
    });
  },

  /**
   * Updates an order's scheduled time.
   * @param orderId - The UUID of the order to update.
   * @param newTime - The new date and time for fulfillment.
   * @returns The updated order object.
   */
  async updateOrderScheduleTime(orderId: string, newTime: Date) {
    const [updatedOrder] = await this.db
      .update(orders)
      .set({
        scheduledTime: newTime,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    return updatedOrder;
  },

  /**
   * Retrieves historical or active orders for a specific user with full relational data.
   * @remarks
   * This method fetches orders where the user is either the buyer or the seller,
   * joins counterparty profile information, and aggregates all associated order items
   * and product details into a nested structure.
   * @param params - The filter criteria for the query.
   * @param params.userId - The unique identifier of the user whose orders are being retrieved.
   * @param params.role - Determines if the user is fetched as the 'buyer' or 'seller' in the transaction.
   * @param params.status - (Optional) Filter by order state: 'pending', 'completed', or 'canceled'.
   * @param params.timeframeDays - (Optional) Limit results to orders created within this many days from today.
   * @param params.limit - Limit the max amount of orders.
   * @param params.offset - The pagination offset.
   * @returns A promise resolving to an array of orders and the total order count. Each order includes:
   * - Full order record fields
   * - `counterparty`: Public profile of the other party (ID, name, image, email)
   * - `items`: An array of order items, each including the full `product` (produce) details.
   * @throws Will throw an error if the database connection fails or the query is malformed.
   */
  async getOrders(params: {
    userId: string;
    role: 'buyer' | 'seller';
    status?: OrderStatus;
    timeframeDays?: number;
    limit: number;
    offset: number;
  }) {
    const conditions = [];

    if (params.role === 'seller') {
      conditions.push(eq(orders.sellerId, params.userId));
    } else {
      conditions.push(eq(orders.buyerId, params.userId));
    }

    if (params.status) {
      conditions.push(eq(orders.status, params.status));
    }

    if (params.timeframeDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - params.timeframeDays);
      conditions.push(gte(orders.createdAt, cutoffDate));
    }

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(${orders.id})::int`,
      })
      .from(orders)
      .where(and(...conditions));

    const total = totalCountResult?.count || 0;

    const ordersResult = await this.db
      .select({
        order: orders,
        counterparty: {
          id: users.id,
          name: users.name,
          image: users.image,
          email: users.email,
        },
      })
      .from(orders)
      .leftJoin(users, eq(params.role === 'seller' ? orders.buyerId : orders.sellerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    if (ordersResult.length === 0) {
      return { items: [], total };
    }

    const orderIds = ordersResult.map((o) => o.order.id);

    const itemsResult = await this.db
      .select({
        orderItem: orderItems,
        product: produce,
      })
      .from(orderItems)
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(inArray(orderItems.orderId, orderIds));

    const items = ordersResult.map((o) => ({
      ...o.order,
      counterparty: o.counterparty,
      items: itemsResult
        .filter((i) => i.orderItem.orderId === o.order.id)
        .map((i) => ({
          ...i.orderItem,
          product: i.product,
        })),
    }));

    return { items, total };
  },

  /**
   * Retrieves the payout history items for a seller since a specific date with pagination.
   * @param sellerId - The unique seller ID
   * @param startDate - The cutoff date to start fetching records
   * @param limit - Number of records per page
   * @param offset - Offset index for database query
   * @returns Object containing the paginated items and total count
   */
  async getPayoutHistory(sellerId: string, startDate: Date, limit: number, offset: number) {
    const baseWhere = and(
      eq(orders.sellerId, sellerId),
      gte(orders.createdAt, startDate),
      eq(orders.status, 'completed'),
    );

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(baseWhere);

    const total = totalCountResult?.count || 0;

    const items = await this.db
      .select({
        date: orders.createdAt,
        buyerName: users.name,
        productName: produce.title,
        quantityOz: orderItems.quantityOz,
        pricePerOz: orderItems.pricePerOz,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(baseWhere)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },

  /**
   * Counts the number of unique buyers that have placed an order with a seller since a given date.
   * @param sellerId - The unique identifier of the seller
   * @param since - The starting date to filter orders
   * @returns The count of unique active buyers
   */
  async getActiveBuyerCount(sellerId: string, since: Date): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(distinct ${orders.buyerId})::int` })
      .from(orders)
      .where(and(eq(orders.sellerId, sellerId), gte(orders.createdAt, since)));

    return result?.count ?? 0;
  },

  /**
   * Retrieves specific analytics data for an array of product IDs.
   * @param productIds - An array of product IDs
   * @returns Analytics like quantity, price, and status for the given products
   */
  async getAnalyticsForProducts(productIds: string[]) {
    if (!productIds.length) return [];
    return await this.db
      .select({
        productId: orderItems.productId,
        quantityOz: orderItems.quantityOz,
        pricePerOz: orderItems.pricePerOz,
        status: orders.status,
        createdAt: orders.createdAt,
        orderId: orders.id,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(inArray(orderItems.productId, productIds));
  },

  /**
   * Retrieves an order and its associated line items.
   * @param orderId - The UUID of the order.
   * @returns The combined order and items object or null.
   */
  async getOrderWithItemsById(orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));

    if (!order) return null;

    const items = await this.db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: produce.title,
        quantityOz: orderItems.quantityOz,
        pricePerOz: orderItems.pricePerOz,
      })
      .from(orderItems)
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(eq(orderItems.orderId, orderId));

    return {
      ...order,
      items,
    };
  },

  /**
   * Retrieves all pending order IDs that contain a specific product.
   * @param productId - The UUID of the product.
   * @returns An array of order IDs.
   */
  async getPendingOrdersByProductId(productId: string): Promise<string[]> {
    const affectedOrders = await this.db
      .selectDistinct({ orderId: orders.id })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.productId, productId),
          notInArray(orders.status, ['canceled', 'refund_pending', 'completed']),
        ),
      );

    return affectedOrders.map((o) => o.orderId);
  },
};
