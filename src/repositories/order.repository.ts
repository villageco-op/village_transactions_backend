import { eq, inArray, and, gt } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { cartReservations, orders, orderItems, produce, subscriptions } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

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
    totalAmount: number;
    fulfillmentType: 'pickup' | 'delivery';
    scheduledTime: Date;
    reservationIds: string[];
  }) {
    if (!payload.reservationIds || payload.reservationIds.length === 0) {
      throw new Error('Reservations expired or not found.');
    }

    return await this.db.transaction(async (tx) => {
      const reservedItems = await tx
        .select({
          reservation: cartReservations,
          product: produce,
        })
        .from(cartReservations)
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

      const [newOrder] = await tx
        .insert(orders)
        .values({
          buyerId: payload.buyerId,
          sellerId: payload.sellerId,
          stripeSessionId: payload.stripeSessionId,
          paymentMethod: 'card',
          fulfillmentType: payload.fulfillmentType,
          scheduledTime: payload.scheduledTime,
          totalAmount: payload.totalAmount.toString(),
        })
        .returning();

      for (const { reservation, product } of reservedItems) {
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          productId: product.id,
          quantityOz: reservation.quantityOz,
          pricePerOz: product.pricePerOz,
        });

        if (reservation.isSubscription) {
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

        const newInventory = Math.max(
          0,
          Number(product.totalOzInventory) - Number(reservation.quantityOz),
        );
        await tx
          .update(produce)
          .set({ totalOzInventory: newInventory.toString() })
          .where(eq(produce.id, product.id));
      }

      await tx.delete(cartReservations).where(inArray(cartReservations.id, payload.reservationIds));

      return newOrder;
    });
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
};
