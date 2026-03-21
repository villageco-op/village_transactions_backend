import { HTTPException } from 'hono/http-exception';

import { subscriptionRepository } from '../repositories/subscription.repository.js';

import { updateStripeSubscriptionStatus } from './stripe.service.js';

/**
 * Updates the status of a specific buyer subscription.
 * This function performs a local check to ensure the subscription exists,
 * synchronizes the status change with Stripe (if a Stripe ID exists),
 * and finally persists the change in the local database.
 * @param buyerId - The unique identifier of the buyer owning the subscription.
 * @param subscriptionId - The unique identifier of the subscription to update.
 * @param status - The new status to apply ('active', 'paused', or 'cancelled').
 * @returns The updated subscription record from the database.
 * @throws {HTTPException} 404 error if the subscription does not exist for the given buyer.
 */
export async function updateSubscriptionStatus(
  buyerId: string,
  subscriptionId: string,
  status: 'active' | 'paused' | 'cancelled',
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
