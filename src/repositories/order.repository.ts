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
};
