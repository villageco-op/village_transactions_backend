import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { updateSubscriptionStatus } from '../../../src/services/subscription.service.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { updateStripeSubscriptionStatus } from '../../../src/services/stripe.service.js';

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getBuyerSubscription: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock('../../../src/services/stripe.service.js', () => ({
  updateStripeSubscriptionStatus: vi.fn(),
}));

describe('SubscriptionService - updateSubscriptionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw 404 if the subscription does not exist or belong to buyer', async () => {
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValueOnce(null);

    await expect(updateSubscriptionStatus('buyer_1', 'sub_123', 'paused')).rejects.toThrow(
      new HTTPException(404, { message: 'Subscription not found' }),
    );
  });

  it('should only update local DB if there is no linked Stripe Subscription ID', async () => {
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValueOnce({
      id: 'sub_123',
      stripeSubscriptionId: null,
    } as any);

    await updateSubscriptionStatus('buyer_1', 'sub_123', 'paused');

    expect(updateStripeSubscriptionStatus).not.toHaveBeenCalled();
    expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith('sub_123', 'paused');
  });

  it('should update Stripe and local DB when cancelling an active subscription', async () => {
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValueOnce({
      id: 'sub_123',
      stripeSubscriptionId: 'stripe_sub_999',
    } as any);

    await updateSubscriptionStatus('buyer_1', 'sub_123', 'canceled');

    expect(updateStripeSubscriptionStatus).toHaveBeenCalledWith('stripe_sub_999', 'canceled');
    expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith('sub_123', 'canceled');
  });
});
