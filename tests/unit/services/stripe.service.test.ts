import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';

import {
  __setStripeClient,
  generateStripeOnboardLink,
} from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { updateInternalStripeAccountId } from '../../../src/services/user.service.js';
import { processStripeWebhookEvent } from '../../../src/services/stripe.service.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';

const mockStripe = {
  accounts: {
    create: vi.fn().mockResolvedValue({ id: 'acct_test' }),
  },
  accountLinks: {
    create: vi.fn().mockResolvedValue({ url: 'test_url' }),
  },
  subscriptions: {
    update: vi.fn(),
    cancel: vi.fn(),
  },
} as unknown as Mocked<Stripe>;

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/services/user.service.js', () => ({
  updateInternalStripeAccountId: vi.fn(),
}));

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    fulfillCheckoutSession: vi.fn(),
  },
}));

vi.mock('../../../src/services/notification.service.js', () => ({
  sendPushNotification: vi.fn(),
}));

describe('StripeService - generateStripeOnboardLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    __setStripeClient(mockStripe);
  });

  it('should throw a 404 if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(generateStripeOnboardLink('missing_user')).rejects.toThrow(HTTPException);
  });

  it('should create a Stripe account and link if user does NOT have a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_1',
      stripeAccountId: null,
    } as any);

    vi.mocked(mockStripe.accounts.create).mockResolvedValueOnce({
      id: 'acct_new123',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_1');

    expect(mockStripe.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      country: 'US',
      capabilities: { transfers: { requested: true } },
    });

    expect(updateInternalStripeAccountId).toHaveBeenCalledWith('user_1', 'acct_new123');

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_new123',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/onboard');
  });

  it('should skip creating a Stripe account and ONLY generate link if user ALREADY has a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_2',
      stripeAccountId: 'acct_existing999',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/resume-onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_2');

    expect(mockStripe.accounts.create).not.toHaveBeenCalled();
    expect(updateInternalStripeAccountId).not.toHaveBeenCalled();

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_existing999',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/resume-onboard');
  });
});

describe('StripeService - processStripeWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process account.updated event and update onboarding status', async () => {
    userRepository.updateStripeOnboardingStatus = vi.fn().mockResolvedValue(undefined);

    const event = {
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_123',
          details_submitted: true,
          charges_enabled: true,
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(userRepository.updateStripeOnboardingStatus).toHaveBeenCalledWith('acct_123', true);
  });

  it('should process checkout.session.completed event and fulfill order', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'buyer_1',
      name: 'Alice Smith',
    } as any);

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          subscription: 'sub_stripe_abc123',
          amount_total: 1500,
          metadata: {
            buyerId: 'buyer_1',
            sellerId: 'seller_1',
            reservationIds: 'res_1,res_2',
            fulfillmentType: 'pickup',
            scheduledTime: '2026-05-15T12:00:00Z',
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillCheckoutSession).toHaveBeenCalledWith({
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      stripeSessionId: 'cs_test_123',
      stripeSubscriptionId: 'sub_stripe_abc123',
      totalAmount: 15,
      fulfillmentType: 'pickup',
      scheduledTime: new Date('2026-05-15T12:00:00Z'),
      reservationIds: ['res_1', 'res_2'],
    });

    expect(sendPushNotification).toHaveBeenCalledWith(
      'seller_1',
      'New Order Received! 🥬',
      'New order from Alice! Open the app to view details.',
    );
  });

  it('should skip checkout.session.completed if missing essential metadata', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_missing_meta',
          metadata: {
            buyerId: 'buyer_1', // Missing sellerId and reservationIds
          },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event);

    expect(orderRepository.fulfillCheckoutSession).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});
