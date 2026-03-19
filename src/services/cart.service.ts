import { cartRepository } from '../repositories/cart.repository.js';
import type { AddToCartPayload } from '../schemas/cart.schema.js';

/**
 * Creates a new cart reservation for the authenticated buyer.
 * @param buyerId - User's unique ID injected by auth session
 * @param data - The add-to-cart payload from the request body
 * @returns The newly created cart reservation data
 */
export async function addToCart(buyerId: string, data: AddToCartPayload) {
  return await cartRepository.addToCart(buyerId, data);
}

/**
 * Fetches the user's active cart and groups items by seller.
 * @param buyerId - User's unique ID injected by auth session
 * @returns Array of cart reservations grouped by seller
 */
export async function getCart(buyerId: string) {
  const activeItems = await cartRepository.getActiveCart(buyerId);

  type GroupedCart = {
    seller: { id: string; name: string | null };
    items: {
      reservationId: string;
      productId: string;
      title: string;
      pricePerOz: string;
      quantityOz: string;
      isSubscription: boolean | null;
      expiresAt: string;
      images: string[] | null;
    }[];
  };

  const grouped = new Map<string, GroupedCart>();

  for (const row of activeItems) {
    const { seller } = row;

    if (!grouped.has(seller.id)) {
      grouped.set(seller.id, {
        seller,
        items: [],
      });
    }

    grouped.get(seller.id)!.items.push({
      reservationId: row.reservation.id,
      productId: row.product.id,
      title: row.product.title,
      pricePerOz: row.product.pricePerOz,
      quantityOz: row.reservation.quantityOz,
      isSubscription: row.reservation.isSubscription,
      expiresAt: row.reservation.expiresAt.toISOString(),
      images: row.product.images,
    });
  }

  return Array.from(grouped.values());
}

/**
 * Removes a specific item reservation from the user's active cart.
 * @param buyerId - User's unique ID injected by auth session
 * @param reservationId - The unique ID of the reservation to remove
 * @returns A boolean indicating whether the removal was successful
 */
export async function removeFromCart(buyerId: string, reservationId: string) {
  return await cartRepository.removeFromCart(buyerId, reservationId);
}
