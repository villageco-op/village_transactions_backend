import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  getSubscriptionDetails,
  getSubscriptions,
  updateSubscriptionStatus,
} from '../../../src/services/subscription.service.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { updateStripeSubscriptionStatus } from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { GetSubscriptionsQuery } from '../../../src/schemas/subscription.schema.js';

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getBuyerSubscription: vi.fn(),
    updateStatus: vi.fn(),
    getSubscriptionDetailsById: vi.fn(),
    querySubscriptions: vi.fn(),
  },
}));

vi.mock('../../../src/services/stripe.service.js', () => ({
  updateStripeSubscriptionStatus: vi.fn(),
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
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

describe('SubscriptionService - getSubscriptionDetails', () => {
  const mockSubscriptionId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw 404 if the subscription does not exist', async () => {
    vi.mocked(subscriptionRepository.getSubscriptionDetailsById).mockResolvedValueOnce(null);

    await expect(getSubscriptionDetails(mockSubscriptionId, 'buyer_1')).rejects.toThrow(
      new HTTPException(404, { message: 'Subscription not found' }),
    );
  });

  it('should throw 404 if the requesting user is neither the buyer nor the seller', async () => {
    vi.mocked(subscriptionRepository.getSubscriptionDetailsById).mockResolvedValueOnce({
      id: mockSubscriptionId,
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      productId: 'prod_1',
    } as any);

    await expect(getSubscriptionDetails(mockSubscriptionId, 'unauthorized_user')).rejects.toThrow(
      new HTTPException(404, { message: 'Subscription not found' }),
    );
  });

  it('should return sanitized subscription details when requested by the buyer', async () => {
    vi.mocked(subscriptionRepository.getSubscriptionDetailsById).mockResolvedValueOnce({
      id: mockSubscriptionId,
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      stripeSubscriptionId: 'secret_stripe_id',
      status: 'active',
    } as any);

    vi.mocked(userRepository.findById).mockImplementation(async (id: string) => {
      if (id === 'buyer_1') return { id: 'buyer_1', name: 'Buyer', email: 'buyer@test.com' } as any;
      if (id === 'seller_1')
        return { id: 'seller_1', name: 'Seller', email: 'seller@test.com' } as any;
      return null;
    });

    const result = await getSubscriptionDetails(mockSubscriptionId, 'buyer_1');

    // Ensure stripeSubscriptionId is stripped
    expect(result).not.toHaveProperty('stripeSubscriptionId');
    expect(result.id).toBe(mockSubscriptionId);
    expect(result.status).toBe('active');

    // Check sanitized user info
    expect(result.buyer).toEqual({
      id: 'buyer_1',
      name: 'Buyer',
      email: 'buyer@test.com',
      location: {
        lat: null,
        lng: null,
        address: null,
        city: null,
        state: null,
        country: null,
        zip: null,
      },
    });

    expect(result.seller).toEqual({
      id: 'seller_1',
      name: 'Seller',
      email: 'seller@test.com',
      location: {
        lat: null,
        lng: null,
        address: null,
        city: null,
        state: null,
        country: null,
        zip: null,
      },
    });
  });

  it('should return sanitized subscription details when requested by the seller', async () => {
    vi.mocked(subscriptionRepository.getSubscriptionDetailsById).mockResolvedValueOnce({
      id: mockSubscriptionId,
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
    } as any);

    vi.mocked(userRepository.findById).mockResolvedValue(null);

    const result = await getSubscriptionDetails(mockSubscriptionId, 'seller_1');

    // Should return null for buyer/seller if user lookup yields nothing
    expect(result.buyer).toBeNull();
    expect(result.seller).toBeNull();
  });
});

describe('SubscriptionService - getSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw 403 if a user tries to query another buyers subscriptions explicitly', async () => {
    const query: GetSubscriptionsQuery = { buyerId: 'different_buyer', page: 1, limit: 10 };

    await expect(getSubscriptions('user_1', query, 0)).rejects.toThrow(
      new HTTPException(403, { message: 'Forbidden: Cannot view other buyers subscriptions' }),
    );
  });

  it('should throw 403 if a user tries to query another sellers subscriptions explicitly', async () => {
    const query: GetSubscriptionsQuery = { sellerId: 'different_seller', page: 1, limit: 10 };

    await expect(getSubscriptions('user_1', query, 0)).rejects.toThrow(
      new HTTPException(403, { message: 'Forbidden: Cannot view other sellers subscriptions' }),
    );
  });

  it('should correctly format repository output and calculate pagination meta', async () => {
    vi.mocked(subscriptionRepository.querySubscriptions).mockResolvedValueOnce({
      total: 25,
      data: [
        {
          subscription: { id: 'sub_1', stripeSubscriptionId: 'stripe_1', status: 'active' } as any,
          product: { id: 'prod_1', sellerId: 'seller_1' } as any,
          buyer: { id: 'buyer_1', name: 'Buyer', email: 'b@test.com' } as any,
          seller: { id: 'seller_1', name: 'Seller', email: 's@test.com' } as any,
        },
      ],
    });

    const query: GetSubscriptionsQuery = { buyerId: 'buyer_1', page: 2, limit: 10 };
    const offset = 10;

    const result = await getSubscriptions('buyer_1', query, offset);

    expect(result.meta).toEqual({
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3, // Math.ceil(25 / 10)
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('stripeSubscriptionId'); // Should be stripped
    expect(result.data[0].id).toBe('sub_1');
    expect(result.data[0].sellerId).toBe('seller_1');
    expect(result.data[0].product.id).toBe('prod_1');

    expect(result.data[0].buyer).toMatchObject({
      id: 'buyer_1',
      name: 'Buyer',
      email: 'b@test.com',
    });
  });
});
