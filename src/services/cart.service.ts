import { cartRepository } from '../repositories/cart.repository.js';
import type {
  AddToCartPayload,
  CartCheckoutGroup,
  UpdateCartPayload,
} from '../schemas/cart.schema.js';
import { calculateDistanceMiles } from '../utils.js';

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
 * Fetches the user's active cart and groups items into checkout groups
 * separated by Seller AND whether the cart items are for subscriptions.
 * Estimates delivery fees based on distance for optional non-pickup configurations.
 * @param buyerId - User's unique ID injected by auth session
 * @returns Array of Cart Checkout Groups
 */
export async function getCart(buyerId: string): Promise<CartCheckoutGroup[]> {
  const activeItems = await cartRepository.getActiveCart(buyerId);

  const DELIVERY_FEE_BASE = parseFloat(process.env.DELIVERY_FEE_BASE || '5.00');
  const DELIVERY_FEE_PER_MILE = parseFloat(process.env.DELIVERY_FEE_PER_MILE || '1.50');
  const SUBSCRIPTION_DISCOUNT_PERCENT = parseFloat(
    process.env.SUBSCRIPTION_DISCOUNT_PERCENT || '10',
  );

  const grouped = new Map<string, CartCheckoutGroup>();

  for (const row of activeItems) {
    const { seller, buyer, product, reservation } = row;
    const isSubscription = Boolean(reservation.isSubscription);

    // Group Identifier separating Subscriptions from One-Time purchases per farm.
    const groupId = `${seller.id}-${isSubscription ? 'sub' : 'onetime'}`;

    if (!grouped.has(groupId)) {
      // Calculate delivery fee estimate if buyer/seller coordinates exist
      let calculatedDeliveryFee = DELIVERY_FEE_BASE;
      if (buyer.lat && buyer.lng && seller.lat && seller.lng) {
        const miles = calculateDistanceMiles(buyer.lat, buyer.lng, seller.lat, seller.lng);
        calculatedDeliveryFee += miles * DELIVERY_FEE_PER_MILE;
      }

      grouped.set(groupId, {
        groupId,
        isSubscription,
        deliveryFee: calculatedDeliveryFee.toFixed(2),
        seller: { id: seller.id, name: seller.name },
        items: [],
      });
    }

    // Determine absolute max order quantity: min(total available, seller enforced limit)
    const availableQty = parseFloat(product.totalOzInventory);
    const sellerEnforcedMax = product.maxOrderQuantityOz
      ? parseFloat(product.maxOrderQuantityOz)
      : Infinity;
    const absoluteMaxAllowed = Math.min(availableQty, sellerEnforcedMax);

    grouped.get(groupId)!.items.push({
      reservationId: reservation.id,
      productId: product.id,
      title: product.title,
      pricePerOz: product.pricePerOz,
      quantityOz: reservation.quantityOz,
      maxOrderQuantityOz: absoluteMaxAllowed.toFixed(2),
      isSubscription,
      subscriptionFrequencyDays: isSubscription ? product.harvestFrequencyDays : null,
      subscriptionCostReductionPercent: isSubscription ? SUBSCRIPTION_DISCOUNT_PERCENT : null,
      expiresAt: reservation.expiresAt.toISOString(),
      images: product.images,
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

/**
 * Cleans up all globally expired cart reservations.
 * Expected to be executed by a secure cron trigger.
 * @returns The number of removed reservations
 */
export async function releaseExpiredCarts(): Promise<number> {
  return await cartRepository.releaseExpiredCarts();
}

/**
 * Updates a specific item reservation in the user's active cart.
 * @param buyerId - User's unique ID injected by auth session
 * @param reservationId - The unique ID of the reservation to update
 * @param data - The update payload
 * @returns A boolean indicating whether the update was successful
 */
export async function updateCartItem(
  buyerId: string,
  reservationId: string,
  data: UpdateCartPayload,
) {
  return await cartRepository.updateCartItem(buyerId, reservationId, data);
}
