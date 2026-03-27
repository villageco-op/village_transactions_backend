import { eq, lt, and, gte } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { cartReservations, produce, users } from '../db/schema.js';
import type { DbClient } from '../db/types.js';
import type { AddToCartPayload } from '../schemas/cart.schema.js';

type CartReservation = typeof cartReservations.$inferSelect;

export const cartRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Adds an item to the user's cart and creates a soft reservation.
   * Expires 15 minutes from creation.
   *
   * @param buyerId - The ID of the user buying the produce
   * @param data - The parsed payload containing reservation details
   * @returns The newly created cart reservation record
   */
  async addToCart(buyerId: string, data: AddToCartPayload): Promise<CartReservation> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const [reservation] = await this.db
      .insert(cartReservations)
      .values({
        buyerId,
        productId: data.productId,
        quantityOz: data.quantityOz.toString(),
        isSubscription: data.isSubscription,
        expiresAt,
      })
      .returning();

    return reservation;
  },

  /**
   * Drops expired reservations automatically, then gets active cart
   * reservations for a buyer, joining produce and seller details.
   * @param buyerId - The ID of the user buying the produce
   * @returns The non expired cart reservations grouped by seller id
   */
  async getActiveCart(buyerId: string) {
    const now = new Date();

    await this.db
      .delete(cartReservations)
      .where(and(eq(cartReservations.buyerId, buyerId), lt(cartReservations.expiresAt, now)));

    return await this.db
      .select({
        reservation: cartReservations,
        product: produce,
        seller: {
          id: users.id,
          name: users.name,
        },
      })
      .from(cartReservations)
      .innerJoin(produce, eq(cartReservations.productId, produce.id))
      .innerJoin(users, eq(produce.sellerId, users.id))
      .where(and(eq(cartReservations.buyerId, buyerId), gte(cartReservations.expiresAt, now)));
  },
};
