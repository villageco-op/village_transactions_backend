import { HTTPException } from 'hono/http-exception';

import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';

import { updateStripeSubscriptionStatus } from './stripe.service.js';

/**
 * Updates the status of a specific buyer subscription.
 * This function performs a local check to ensure the subscription exists,
 * synchronizes the status change with Stripe (if a Stripe ID exists),
 * and finally persists the change in the local database.
 * @param buyerId - The unique identifier of the buyer owning the subscription.
 * @param subscriptionId - The unique identifier of the subscription to update.
 * @param status - The new status to apply ('active', 'paused', or 'canceled').
 * @returns The updated subscription record from the database.
 * @throws {HTTPException} 404 error if the subscription does not exist for the given buyer.
 */
export async function updateSubscriptionStatus(
  buyerId: string,
  subscriptionId: string,
  status: 'active' | 'paused' | 'canceled',
) {
  const subscription = await subscriptionRepository.getBuyerSubscription(buyerId, subscriptionId);

  if (!subscription) {
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  if (subscription.stripeSubscriptionId) {
    await updateStripeSubscriptionStatus(subscription.stripeSubscriptionId, status);
  }

  return await subscriptionRepository.updateStatus(subscriptionId, status);
}

/**
 * Retrieves comprehensive details of a specific subscription.
 * Ensures the requesting user is either the buyer or the seller of the product.
 * @param subscriptionId - The ID of the subscription
 * @param requestingUserId - The ID of the authenticated user
 * @returns Full subscription data with product, buyer, and seller info
 */
export async function getSubscriptionDetails(subscriptionId: string, requestingUserId: string) {
  const subscriptionData = await subscriptionRepository.getSubscriptionDetailsById(subscriptionId);

  if (!subscriptionData) {
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  const isBuyer = subscriptionData.buyerId === requestingUserId;
  const isSeller = subscriptionData.sellerId === requestingUserId;

  if (!isBuyer && !isSeller) {
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  const [buyerData, sellerData] = await Promise.all([
    userRepository.findById(subscriptionData.buyerId),
    userRepository.findById(subscriptionData.sellerId),
  ]);

  const safeBuyer = buyerData
    ? {
        id: buyerData.id,
        name: buyerData.name,
        email: buyerData.email,
        location: {
          lat: buyerData.lat ?? null,
          lng: buyerData.lng ?? null,
          address: buyerData.address ?? null,
          city: buyerData.city ?? null,
          state: buyerData.state ?? null,
          country: buyerData.country ?? null,
          zip: buyerData.zip ?? null,
        },
      }
    : null;

  const safeSeller = sellerData
    ? {
        id: sellerData.id,
        name: sellerData.name,
        email: sellerData.email,
        location: {
          lat: sellerData.lat ?? null,
          lng: sellerData.lng ?? null,
          address: sellerData.address ?? null,
          city: sellerData.city ?? null,
          state: sellerData.state ?? null,
          country: sellerData.country ?? null,
          zip: sellerData.zip ?? null,
        },
      }
    : null;

  const { stripeSubscriptionId: _stripeSubscriptionId, ...safeSubscriptionData } = subscriptionData;

  return {
    ...safeSubscriptionData,
    buyer: safeBuyer,
    seller: safeSeller,
  };
}
