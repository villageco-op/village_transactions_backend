import { HTTPException } from 'hono/http-exception';
import Stripe from 'stripe';
import type { Mocked } from 'vitest';

import { userRepository } from '../repositories/user.repository.js';

import { updateInternalStripeAccountId } from './user.service.js';

type StripeClient = Pick<Stripe, 'accounts' | 'accountLinks'>;

let stripe: StripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * Allows overriding the stripe client for testing.
 * @param mock A partial mocked stripe client with accounts and account links.
 */
export const __setStripeClient = (mock: Mocked<StripeClient>) => {
  stripe = mock as StripeClient;
};

/**
 * Generates an onboarding link for a seller. Creates a connected Express account if one does not exist.
 * @param userId - The ID of the authenticated user
 * @returns The Stripe Account Link URL
 */
export async function generateStripeOnboardLink(userId: string) {
  const user = await userRepository.findById(userId);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  let stripeAccountId = user.stripeAccountId;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      capabilities: {
        transfers: { requested: true },
      },
    });

    stripeAccountId = account.id;

    await updateInternalStripeAccountId(userId, stripeAccountId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/onboarding/refresh`,
    return_url: `${appUrl}/dashboard`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}
