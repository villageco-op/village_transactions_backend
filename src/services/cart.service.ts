import type { ScheduleType } from '../db/types.js';
import { cartRepository } from '../repositories/cart.repository.js';
import type {
  AddToCartPayload,
  CartCheckoutGroup,
  UpdateCartGroupPayload,
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
 * separated by Seller, whether the cart items are for subscriptions,
 * and the subscription frequency.
 * Estimates delivery fees based on distance for optional non-pickup configurations.
 * @param buyerId - User's unique ID injected by auth session
 * @returns Array of Cart Checkout Groups
 */
export async function getCart(buyerId: string): Promise<CartCheckoutGroup[]> {
  const activeRows = await cartRepository.getActiveCart(buyerId);

  const DELIVERY_FEE_BASE = parseFloat(process.env.DELIVERY_FEE_BASE || '5.00');
  const DELIVERY_FEE_PER_MILE = parseFloat(process.env.DELIVERY_FEE_PER_MILE || '1.50');
  const SUBSCRIPTION_DISCOUNT_PERCENT = parseFloat(
    process.env.SUBSCRIPTION_DISCOUNT_PERCENT || '10',
  );

  const grouped = new Map<string, CartCheckoutGroup>();

  for (const row of activeRows) {
    const { group, seller, buyer, product, reservation } = row;

    const productAvailableBy = new Date(product.availableBy);

    if (!grouped.has(group.id)) {
      let calculatedDeliveryFee = DELIVERY_FEE_BASE;
      if (buyer.lat && buyer.lng && seller.lat && seller.lng) {
        const miles = calculateDistanceMiles(buyer.lat, buyer.lng, seller.lat, seller.lng);
        calculatedDeliveryFee += miles * DELIVERY_FEE_PER_MILE;
      }

      grouped.set(group.id, {
        groupId: group.id,
        isSubscription: group.isSubscription,
        frequencyDays: group.frequencyDays,
        fulfillmentType: group.fulfillmentType as ScheduleType,
        deliveryFee: calculatedDeliveryFee.toFixed(2),
        availableBy: productAvailableBy.toISOString(),
        seller: { id: seller.id, name: seller.name },
        items: [],
      });
    } else {
      const currentGroupDate = new Date(grouped.get(group.id)!.availableBy);
      if (productAvailableBy > currentGroupDate) {
        grouped.get(group.id)!.availableBy = productAvailableBy.toISOString();
      }
    }

    const availableQty = parseFloat(product.totalOzInventory);
    const sellerEnforcedMax = product.maxOrderQuantityOz
      ? parseFloat(product.maxOrderQuantityOz)
      : Infinity;
    const absoluteMaxAllowed = Math.min(availableQty, sellerEnforcedMax);

    grouped.get(group.id)!.items.push({
      reservationId: reservation.id,
      productId: product.id,
      title: product.title,
      pricePerOz: product.pricePerOz,
      quantityOz: reservation.quantityOz,
      maxOrderQuantityOz: absoluteMaxAllowed.toFixed(2),
      isSubscription: group.isSubscription,
      subscriptionFrequencyDays: group.isSubscription ? group.frequencyDays : null,
      subscriptionCostReductionPercent: group.isSubscription ? SUBSCRIPTION_DISCOUNT_PERCENT : null,
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

/**
 * Updates a cart groups fulfillment type.
 * @param buyerId - The buyer that owns the group
 * @param groupId - The cart checkout group ID
 * @param payload - The new field data
 */
export async function updateCartGroup(
  buyerId: string,
  groupId: string,
  payload: UpdateCartGroupPayload,
) {
  await cartRepository.updateGroupFulfillment(buyerId, groupId, payload.fulfillmentType);
}
