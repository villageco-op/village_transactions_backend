import { HTTPException } from 'hono/http-exception';

import type { User } from '../db/types.js';
import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
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
 * @param log - App logger that defaults to a blank logger
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
  log: AppLogger = noopLogger,
) {
  const subscription = await subscriptionRepository.getBuyerSubscription(buyerId, subscriptionId);

  if (!subscription) {
    log.warn('Subscription update failed: record not found or buyer mismatch');
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  if (subscription.stripeSubscriptionId) {
    if (updates.status && updates.status !== subscription.status) {
      log.info(
        { from: subscription.status, to: updates.status },
        'Syncing status change to Stripe',
      );
      await updateStripeSubscriptionStatus(subscription.stripeSubscriptionId, updates.status);
    }

    if (updates.quantityOz && updates.quantityOz !== Number(subscription.quantityOz)) {
      log.info(
        { oldQty: subscription.quantityOz, newQty: updates.quantityOz },
        'Syncing quantity change to Stripe',
      );
      await updateStripeSubscriptionQuantity(subscription.stripeSubscriptionId, updates.quantityOz);
    }
  }

  const updatedSub = await subscriptionRepository.updateSubscriptionData(subscriptionId, updates);

  const product = await produceRepository.getById(subscription.productId);

  if (product && product.sellerId) {
    log.info(
      { sellerId: product.sellerId },
      'Triggering push notification for subscription update',
    );

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
 * @param log - App logger that defaults to a blank logger
 * @returns Full subscription data with product, buyer, and seller info
 */
export async function getSubscriptionDetails(
  subscriptionId: string,
  requestingUserId: string,
  log: AppLogger = noopLogger,
) {
  const subscriptionData = await subscriptionRepository.getSubscriptionDetailsById(subscriptionId);

  if (!subscriptionData) {
    log.warn('Subscription detail lookup failed: 404');
    throw new HTTPException(404, { message: 'Subscription not found' });
  }

  const isBuyer = subscriptionData.buyerId === requestingUserId;
  const isSeller = subscriptionData.sellerId === requestingUserId;

  if (!isBuyer && !isSeller) {
    log.warn(
      { buyerId: subscriptionData.buyerId, sellerId: subscriptionData.sellerId },
      'Unauthorized access attempt to subscription details',
    );
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
        organization: buyerData.organization,
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
        organization: sellerData.organization,
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
 * @param log - App logger that defaults to a blank logger
 * @returns A list of subscriptions and basic buyer and seller user information
 */
export async function getSubscriptions(
  requestingUserId: string,
  query: GetSubscriptionsQuery,
  offset: number,
  log: AppLogger = noopLogger,
) {
  // Security check: Prevent users from arbitrarily searching other users' data.
  if (query.buyerId && query.buyerId !== requestingUserId) {
    log.warn('User attempted to query subscriptions outside their ownership scope');
    throw new HTTPException(403, { message: 'Forbidden: Cannot view other buyers subscriptions' });
  }
  if (query.sellerId && query.sellerId !== requestingUserId) {
    log.warn('User attempted to query subscriptions outside their ownership scope');
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
            organization: user.organization,
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
 * @param log - App logger that defaults to a blank logger
 */
export async function batchCancelProductSubscriptions(
  productId: string,
  reason: string,
  log: AppLogger = noopLogger,
) {
  const affectedSubscriptions = await subscriptionRepository.getSubscriptionsByProduct(productId, [
    'active',
    'paused',
  ]);

  if (affectedSubscriptions.length === 0) return;

  log.info({ count: affectedSubscriptions.length }, 'Starting batch cancelation for product');

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
    log.error(
      {
        failedCount: failed.length,
        totalCount: results.length,
        errors: failed.map((f) => f.reason?.message),
      },
      'Batch cancelation completed with errors',
    );
  } else {
    log.info('Batch cancelation completed successfully');
  }
}
