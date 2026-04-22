import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  getSubscriptionDetails,
  getSubscriptions,
  updateSubscription,
  batchCancelProductSubscriptions,
} from '../../../src/services/subscription.service.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';
import {
  updateStripeSubscriptionQuantity,
  updateStripeSubscriptionStatus,
} from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { GetSubscriptionsQuery } from '../../../src/schemas/subscription.schema.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getBuyerSubscription: vi.fn(),
    updateStatus: vi.fn(),
    getSubscriptionDetailsById: vi.fn(),
    querySubscriptions: vi.fn(),
    getSubscriptionsByProduct: vi.fn(),
    updateSubscriptionData: vi.fn(),
  },
}));

vi.mock('../../../src/services/stripe.service.js', () => ({
  updateStripeSubscriptionStatus: vi.fn(),
  updateStripeSubscriptionQuantity: vi.fn(),
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../../src/services/notification.service.js', () => ({
  sendPushNotification: vi.fn(),
}));

describe('SubscriptionService - updateSubscription', () => {
  const mockBuyerId = 'buyer_123';
  const mockSubId = 'sub_456';
  const mockProductId = 'prod_789';
  const mockSellerId = 'seller_000';

  const mockSubscription = {
    id: mockSubId,
    productId: mockProductId,
    buyerId: mockBuyerId,
    status: 'active',
    quantityOz: 16,
    stripeSubscriptionId: 'si_stripe_123',
  };

  const mockProduct = {
    id: mockProductId,
    sellerId: mockSellerId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValue(
      mockSubscription as any,
    );
    vi.mocked(produceRepository.getById).mockResolvedValue(mockProduct as any);
  });

  it('should throw 404 if the subscription does not exist', async () => {
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValueOnce(null);

    await expect(updateSubscription(mockBuyerId, mockSubId, { status: 'paused' })).rejects.toThrow(
      new HTTPException(404, { message: 'Subscription not found' }),
    );
  });

  it('should update Stripe status and quantity if they change', async () => {
    const updates = { status: 'paused' as const, quantityOz: 32 };

    await updateSubscription(mockBuyerId, mockSubId, updates);

    expect(updateStripeSubscriptionStatus).toHaveBeenCalledWith('si_stripe_123', 'paused');
    expect(updateStripeSubscriptionQuantity).toHaveBeenCalledWith('si_stripe_123', 32);
    expect(subscriptionRepository.updateSubscriptionData).toHaveBeenCalledWith(mockSubId, updates);
  });

  it('should NOT call Stripe if values are the same as current state', async () => {
    const updates = { status: 'active' as const, quantityOz: 16 }; // Same as mockSubscription

    await updateSubscription(mockBuyerId, mockSubId, updates);

    expect(updateStripeSubscriptionStatus).not.toHaveBeenCalled();
    expect(updateStripeSubscriptionQuantity).not.toHaveBeenCalled();
  });

  it('should NOT call Stripe if stripeSubscriptionId is missing', async () => {
    vi.mocked(subscriptionRepository.getBuyerSubscription).mockResolvedValueOnce({
      ...mockSubscription,
      stripeSubscriptionId: null,
    } as any);

    await updateSubscription(mockBuyerId, mockSubId, { status: 'canceled' });

    expect(updateStripeSubscriptionStatus).not.toHaveBeenCalled();
    expect(subscriptionRepository.updateSubscriptionData).toHaveBeenCalled();
  });

  describe('Notifications', () => {
    it('should send "canceled" message when status is canceled', async () => {
      await updateSubscription(mockBuyerId, mockSubId, {
        status: 'canceled',
        cancelReason: 'Too expensive',
      });

      expect(sendPushNotification).toHaveBeenCalledWith(
        mockSellerId,
        'Subscription Updated 🔄',
        expect.stringContaining('canceled their subscription. Reason: Too expensive'),
      );
    });

    it('should send "quantity" message when quantity is updated', async () => {
      await updateSubscription(mockBuyerId, mockSubId, { quantityOz: 64 });

      expect(sendPushNotification).toHaveBeenCalledWith(
        mockSellerId,
        'Subscription Updated 🔄',
        'A customer updated their subscription quantity to 64oz.',
      );
    });

    it('should send default message for other updates (e.g., fulfillmentType)', async () => {
      await updateSubscription(mockBuyerId, mockSubId, { fulfillmentType: 'delivery' });

      expect(sendPushNotification).toHaveBeenCalledWith(
        mockSellerId,
        'Subscription Updated 🔄',
        'A customer has updated their subscription details.',
      );
    });
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
      activeCount: 15,
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
      activeCount: 15,
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

describe('SubscriptionService - batchCancelProductSubscriptions', () => {
  const mockProductId = 'prod_123';
  const mockReason = 'The farmer removed an item in this order from their shop.';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return early if no subscriptions are found', async () => {
    vi.mocked(subscriptionRepository.getSubscriptionsByProduct).mockResolvedValueOnce([]);

    await batchCancelProductSubscriptions(mockProductId, mockReason);

    expect(subscriptionRepository.getSubscriptionsByProduct).toHaveBeenCalledWith(mockProductId, [
      'active',
      'paused',
    ]);
    expect(subscriptionRepository.updateSubscriptionData).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('should process cancellations, skipping Stripe if no ID exists', async () => {
    const mockSubs = [
      { id: 'sub_stripe', buyerId: 'buyer_1', stripeSubscriptionId: 'si_999' },
      { id: 'sub_no_stripe', buyerId: 'buyer_2', stripeSubscriptionId: null },
    ];

    vi.mocked(subscriptionRepository.getSubscriptionsByProduct).mockResolvedValueOnce(
      mockSubs as any,
    );
    vi.mocked(subscriptionRepository.updateSubscriptionData).mockResolvedValue(true as any);

    await batchCancelProductSubscriptions(mockProductId, mockReason);

    expect(updateStripeSubscriptionStatus).toHaveBeenCalledTimes(1);
    expect(updateStripeSubscriptionStatus).toHaveBeenCalledWith('si_999', 'canceled');

    expect(subscriptionRepository.updateSubscriptionData).toHaveBeenCalledTimes(2);
    expect(subscriptionRepository.updateSubscriptionData).toHaveBeenCalledWith('sub_stripe', {
      status: 'canceled',
      cancelReason: mockReason,
    });

    expect(sendPushNotification).toHaveBeenCalledTimes(2);
    expect(sendPushNotification).toHaveBeenCalledWith(
      'buyer_1',
      'Subscription Canceled ⚠️',
      expect.stringContaining(mockReason),
    );
  });

  it('should handle partial failures gracefully using Promise.allSettled', async () => {
    const mockSubs = [
      { id: 'sub_1', buyerId: 'buyer_1', stripeSubscriptionId: null },
      { id: 'sub_2', buyerId: 'buyer_2', stripeSubscriptionId: null },
    ];

    vi.mocked(subscriptionRepository.getSubscriptionsByProduct).mockResolvedValueOnce(
      mockSubs as any,
    );

    vi.mocked(subscriptionRepository.updateSubscriptionData)
      .mockResolvedValueOnce(true as any)
      .mockRejectedValueOnce(new Error('Database Timeout'));

    await expect(batchCancelProductSubscriptions(mockProductId, mockReason)).resolves.not.toThrow();

    expect(subscriptionRepository.updateSubscriptionData).toHaveBeenCalledTimes(2);
  });
});
