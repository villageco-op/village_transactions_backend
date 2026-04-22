import { HTTPException } from 'hono/http-exception';

import type { User } from '../db/types.js';
import { produceRepository } from '../repositories/produce.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { GetSubscriptionsQuery } from '../schemas/subscription.schema.js';

import { sendPushNotification } from './notification.service.js';
import {
  updateStripeSubscriptionQuantity,
  updateStripeSubscriptionStatus,
} from './stripe.service.js';

/**
 * Updates a subscriptions fields in the DB and with Stripe. Sends a push notification to the other party.
 * @param buyerId - The subscription buyers ID
 * @param subscriptionId - The subscription ID
 * @param updates - The new fields
 * @param updates.status - The new status
 * @param updates.quantityOz - The new quantity
 * @param updates.fulfillmentType - The new fulfillment type
 * @param updates.cancelReason - The reason for canceling or pausing
 * @returns The updated subcription
 */
export async function updateSubscription(
  buyerId: string,
  subscriptionId: string,
  updates: {
    status?: 'active' | 'paused' | 'canceled';
    quantityOz?: number;
    fulfillmentType?: 'pickup' | 'delivery';
    cancelReason?: string;
  },
) {
  const subscription = await subscriptionRepository.getBuyerSubscription(buyerId, subscriptionId);

  if (!subscription) {
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  if (subscription.stripeSubscriptionId) {
    if (updates.status && updates.status !== subscription.status) {
      await updateStripeSubscriptionStatus(subscription.stripeSubscriptionId, updates.status);
    }

    if (updates.quantityOz && updates.quantityOz !== Number(subscription.quantityOz)) {
      await updateStripeSubscriptionQuantity(subscription.stripeSubscriptionId, updates.quantityOz);
    }
  }

  const updatedSub = await subscriptionRepository.updateSubscriptionData(subscriptionId, updates);

  const product = await produceRepository.getById(subscription.productId);

  if (product && product.sellerId) {
    let message = 'A customer has updated their subscription details.';
    if (updates.status === 'canceled')
      message = `A customer canceled their subscription. Reason: ${updates.cancelReason || 'None provided'}`;
    if (updates.status === 'paused')
      message = `A customer paused their subscription. Reason: ${updates.cancelReason || 'None provided'}`;
    if (updates.quantityOz)
      message = `A customer updated their subscription quantity to ${updates.quantityOz}oz.`;

    await sendPushNotification(product.sellerId, 'Subscription Updated 🔄', message);
  }

  return updatedSub;
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
      activeCount: result.activeCount,
      page: query.page,
      limit: query.limit,
      totalPages,
    },
  };
}

/**
 * Cancels all active or paused subscriptions for a specific product.
 * Used when a seller deletes a product or stops offering it as a subscription.
 * @param productId - The product causing the cancelation
 * @param reason - The reason for the cancelation (from the canceling party)
 */
export async function batchCancelProductSubscriptions(productId: string, reason: string) {
  const affectedSubscriptions = await subscriptionRepository.getSubscriptionsByProduct(productId, [
    'active',
    'paused',
  ]);

  if (affectedSubscriptions.length === 0) return;

  const results = await Promise.allSettled(
    affectedSubscriptions.map(async (sub) => {
      if (sub.stripeSubscriptionId) {
        await updateStripeSubscriptionStatus(sub.stripeSubscriptionId, 'canceled');
      }

      await subscriptionRepository.updateSubscriptionData(sub.id, {
        status: 'canceled',
        cancelReason: reason,
      });

      await sendPushNotification(
        sub.buyerId,
        'Subscription Canceled ⚠️',
        `Your subscription was canceled because the farmer updated or removed the listing. Reason: ${reason}`,
      );
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`Batch cancel completed with ${failed.length} errors out of ${results.length}.`);
    failed.forEach((err) => console.error('Reason:', err.reason));
  }
}
