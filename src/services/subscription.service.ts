import { HTTPException } from 'hono/http-exception';

import type { User } from '../db/types.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { GetSubscriptionsQuery } from '../schemas/subscription.schema.js';

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

/**
 * Retrieves a paginated list of subscriptions.
 * Enforces security by verifying the requesting user is the buyer or seller.
 * @param requestingUserId - The ID of the calling user
 * @param query - The query filters
 * @param offset - Pagination offset
 * @returns A list of subscriptions and basic buyer and seller user information
 */
export async function getSubscriptions(
  requestingUserId: string,
  query: GetSubscriptionsQuery,
  offset: number,
) {
  // Security check: Prevent users from arbitrarily searching other users' data.
  if (query.buyerId && query.buyerId !== requestingUserId) {
    throw new HTTPException(403, { message: 'Forbidden: Cannot view other buyers subscriptions' });
  }
  if (query.sellerId && query.sellerId !== requestingUserId) {
    throw new HTTPException(403, { message: 'Forbidden: Cannot view other sellers subscriptions' });
  }

  const result = await subscriptionRepository.querySubscriptions(requestingUserId, query, offset);

  const totalPages = Math.ceil(result.total / query.limit);

  const formattedData = result.data.map((row) => {
    const { stripeSubscriptionId: _stripeId, ...safeSubscription } = row.subscription;

    const mapUser = (user: User | null) =>
      user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            location: {
              lat: user.lat ?? null,
              lng: user.lng ?? null,
              address: user.address ?? null,
              city: user.city ?? null,
              state: user.state ?? null,
              country: user.country ?? null,
              zip: user.zip ?? null,
            },
          }
        : null;

    return {
      ...safeSubscription,
      sellerId: row.product.sellerId,
      product: row.product,
      buyer: mapUser(row.buyer),
      seller: mapUser(row.seller),
    };
  });

  return {
    data: formattedData,
    meta: {
      total: result.total,
      page: query.page,
      limit: query.limit,
      totalPages,
    },
  };
}
