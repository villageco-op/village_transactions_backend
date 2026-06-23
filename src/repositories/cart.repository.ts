import { eq, lt, and, notInArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db as defaultDb } from '../db/index.js';
import { cartGroups, cartReservations, produce, users } from '../db/schema.js';
import type { DbClient } from '../db/types.js';
import { NotFoundError } from '../lib/errors.js';
import type { AddToCartPayload, UpdateCartPayload } from '../schemas/cart.schema.js';

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
  async addToCart(buyerId: string, data: AddToCartPayload) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Get the product to know the seller and frequency
    const [productInfo] = await this.db
      .select()
      .from(produce)
      .where(eq(produce.id, data.productId));

    if (!productInfo) {
      throw new NotFoundError(`Product with ID ${data.productId} not found`);
    }

    const frequencyDays = data.isSubscription ? productInfo.harvestFrequencyDays : 0;

    // Find existing group or create one
    let [group] = await this.db
      .select()
      .from(cartGroups)
      .where(
        and(
          eq(cartGroups.buyerId, buyerId),
          eq(cartGroups.sellerId, productInfo.sellerId),
          eq(cartGroups.isSubscription, data.isSubscription),
          eq(cartGroups.frequencyDays, frequencyDays),
        ),
      );

    if (!group) {
      [group] = await this.db
        .insert(cartGroups)
        .values({
          buyerId,
          sellerId: productInfo.sellerId,
          isSubscription: data.isSubscription,
          frequencyDays,
          fulfillmentType: 'pickup',
        })
        .returning();
    }

    // Add the reservation attached to the group
    const [reservation] = await this.db
      .insert(cartReservations)
      .values({
        groupId: group.id,
        buyerId,
        productId: data.productId,
        quantityOz: data.quantityOz.toString(),
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

    // Delete expired reservations
    await this.db
      .delete(cartReservations)
      .where(and(eq(cartReservations.buyerId, buyerId), lt(cartReservations.expiresAt, now)));

    // Clean up orphaned groups (groups with no active reservations)
    const activeGroupIds = this.db.select({ id: cartReservations.groupId }).from(cartReservations);
    await this.db
      .delete(cartGroups)
      .where(and(eq(cartGroups.buyerId, buyerId), notInArray(cartGroups.id, activeGroupIds)));

    // Fetch cleanly joined active cart data
    const sellerAlias = alias(users, 'seller_users');
    const buyerAlias = alias(users, 'buyer_users');

    return await this.db
      .select({
        group: cartGroups,
        reservation: cartReservations,
        product: produce,
        seller: {
          id: sellerAlias.id,
          name: sellerAlias.name,
          lat: sellerAlias.lat,
          lng: sellerAlias.lng,
        },
        buyer: {
          lat: buyerAlias.lat,
          lng: buyerAlias.lng,
        },
      })
      .from(cartGroups)
      .innerJoin(cartReservations, eq(cartGroups.id, cartReservations.groupId))
      .innerJoin(produce, eq(cartReservations.productId, produce.id))
      .innerJoin(sellerAlias, eq(cartGroups.sellerId, sellerAlias.id))
      .innerJoin(buyerAlias, eq(cartGroups.buyerId, buyerAlias.id))
      .where(eq(cartGroups.buyerId, buyerId));
  },

  /**
   * Removes an item from the cart, releasing the reservation early.
   *
   * @param buyerId - The ID of the user who owns the reservation
   * @param reservationId - The unique ID of the reservation to be removed
   * @returns A boolean indicating if a reservation was successfully removed
   */
  async removeFromCart(buyerId: string, reservationId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(cartReservations)
      .where(and(eq(cartReservations.id, reservationId), eq(cartReservations.buyerId, buyerId)))
      .returning({ id: cartReservations.id });

    return deleted.length > 0;
  },

  /**
   * Globally drops all expired reservations across all buyers.
   * Also cleans up any cart groups that become empty as a result.
   * Triggered automatically by the cron job.
   * @returns The number of deleted reservations
   */
  async releaseExpiredCarts(): Promise<number> {
    const now = new Date();

    return await this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(cartReservations)
        .where(lt(cartReservations.expiresAt, now))
        .returning({ id: cartReservations.id, groupId: cartReservations.groupId });

      if (deleted.length === 0) return 0;

      const affectedGroupIds = [...new Set(deleted.map((d) => d.groupId))];

      for (const groupId of affectedGroupIds) {
        const remainingItems = await tx
          .select()
          .from(cartReservations)
          .where(eq(cartReservations.groupId, groupId))
          .limit(1);

        if (remainingItems.length === 0) {
          await tx.delete(cartGroups).where(eq(cartGroups.id, groupId));
        }
      }

      return deleted.length;
    });
  },

  /**
   * Updates an existing cart reservation's quantity or subscription status.
   * If the subscription status changes, the item is automatically moved to the
   * appropriate Cart Group (created if necessary).
   * Also resets the 15-minute expiration timer.
   *
   * @param buyerId - The ID of the user who owns the reservation
   * @param reservationId - The unique ID of the reservation
   * @param data - The update payload
   * @returns A boolean indicating if the reservation was successfully updated
   */
  async updateCartItem(
    buyerId: string,
    reservationId: string,
    data: UpdateCartPayload,
  ): Promise<boolean> {
    // Fetch the current reservation, its group, and the product
    const [existing] = await this.db
      .select({
        reservation: cartReservations,
        group: cartGroups,
        product: produce,
      })
      .from(cartReservations)
      .innerJoin(cartGroups, eq(cartReservations.groupId, cartGroups.id))
      .innerJoin(produce, eq(cartReservations.productId, produce.id))
      .where(and(eq(cartReservations.id, reservationId), eq(cartReservations.buyerId, buyerId)));

    if (!existing) return false;

    let targetGroupId = existing.group.id;

    // If the user toggled the subscription status, we must move it to the correct group
    if (
      data.isSubscription !== undefined &&
      data.isSubscription !== existing.group.isSubscription
    ) {
      const newFrequency = data.isSubscription ? existing.product.harvestFrequencyDays : 0;

      // Look for an existing group that matches this new configuration
      let [newGroup] = await this.db
        .select()
        .from(cartGroups)
        .where(
          and(
            eq(cartGroups.buyerId, buyerId),
            eq(cartGroups.sellerId, existing.group.sellerId),
            eq(cartGroups.isSubscription, data.isSubscription),
            eq(cartGroups.frequencyDays, newFrequency),
          ),
        );

      // Create it if it doesn't exist, carrying over their fulfillment preference
      if (!newGroup) {
        [newGroup] = await this.db
          .insert(cartGroups)
          .values({
            buyerId,
            sellerId: existing.group.sellerId,
            isSubscription: data.isSubscription,
            frequencyDays: newFrequency,
            fulfillmentType: existing.group.fulfillmentType,
          })
          .returning();
      }

      targetGroupId = newGroup.id;
    }

    // Update the reservation with the new quantity, target group, and extended expiration
    const updateData: Partial<typeof cartReservations.$inferInsert> = {
      groupId: targetGroupId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };

    if (data.quantityOz !== undefined) {
      updateData.quantityOz = data.quantityOz.toString();
    }

    const updated = await this.db
      .update(cartReservations)
      .set(updateData)
      .where(and(eq(cartReservations.id, reservationId), eq(cartReservations.buyerId, buyerId)))
      .returning({ id: cartReservations.id });

    return updated.length > 0;
  },

  /**
   * Updates the fulfillment type for all cart reservations belonging to a specific seller (group).
   * @param buyerId - The buyer ID
   * @param groupId - The checkout group ID
   * @param fulfillmentType - The new fulfillment type
   */
  async updateGroupFulfillment(buyerId: string, groupId: string, fulfillmentType: string) {
    await this.db
      .update(cartGroups)
      .set({ fulfillmentType })
      .where(and(eq(cartGroups.id, groupId), eq(cartGroups.buyerId, buyerId)));
  },

  /**
   * Gets a cart checkout group for a buyer.
   * @param buyerId - The buyer that owns the group
   * @param groupId - The checkout group ID
   * @returns The cart checkout group
   */
  async getCheckoutGroup(buyerId: string, groupId: string) {
    const activeCart = await this.getActiveCart(buyerId);
    return activeCart.filter((row) => row.group.id === groupId);
  },
};
