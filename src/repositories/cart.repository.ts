import { db as defaultDb } from '../db/index.js';
import { cartReservations } from '../db/schema.js';
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
};
