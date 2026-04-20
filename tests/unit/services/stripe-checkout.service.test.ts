import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';

import { __setStripeClient, createCheckoutSession } from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test_url' }),
    },
  },
} as unknown as Mocked<Stripe>;

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    getActiveCart: vi.fn(),
  },
}));

describe('StripeService - createCheckoutSession', () => {
  const buyerId = 'buyer_123';
  const validPayload = {
    sellerId: 'seller_123',
    fulfillmentType: 'pickup',
    scheduledTime: new Date().toISOString(),
  };

  const mockActiveCartItem = {
    reservation: { id: 'res_1', quantityOz: '16', isSubscription: false },
    product: {
      id: 'prod_1',
      title: 'Carrots',
      status: 'active',
      totalOzInventory: '100',
      pricePerOz: '0.50',
      harvestFrequencyDays: 7, // Used for subscription recurring interval
    },
    seller: { id: 'seller_123', name: 'Farmer John' },
  };

  const mockSellerUser = {
    id: 'seller_123',
    stripeAccountId: 'acct_stripe123',
    stripeOnboardingComplete: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    __setStripeClient(mockStripe);
  });

  it('should throw a 400 if there are no active reservations for the seller', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([]); // Empty cart

    await expect(createCheckoutSession(buyerId, validPayload)).rejects.toThrow(
      new HTTPException(400, { message: 'No active reservations found for this seller.' }),
    );
  });

  it('should throw a 400 if a product is no longer active', async () => {
    const invalidItem = {
      ...mockActiveCartItem,
      product: { ...mockActiveCartItem.product, status: 'paused' as any },
    };
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([invalidItem as any]);

    await expect(createCheckoutSession(buyerId, validPayload)).rejects.toThrow(
      /Product is no longer available/,
    );
  });

  it('should throw a 400 if the seller is missing stripe settings', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([mockActiveCartItem as any]);
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      ...mockSellerUser,
      stripeOnboardingComplete: false,
    } as any);

    await expect(createCheckoutSession(buyerId, validPayload)).rejects.toThrow(
      /Seller is not properly configured/,
    );
  });

  it('should successfully create a checkout session for a one-time payment and return the url', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([mockActiveCartItem as any]);
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    const url = await createCheckoutSession(buyerId, validPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Carrots', description: 'One-time order' },
            unit_amount: 50, // Math.round(0.50 * 100)
          },
          quantity: 16,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3000/cart',
      payment_intent_data: {
        application_fee_amount: 16, // Math.round((50 * 16) * 0.02)
        transfer_data: { destination: 'acct_stripe123' },
      },
      metadata: {
        buyerId,
        sellerId: 'seller_123',
        reservationIds: 'res_1',
        fulfillmentType: 'pickup',
        scheduledTime: validPayload.scheduledTime,
      },
    });

    expect(url).toBe('https://checkout.stripe.com/test_url');
  });

  it('should successfully create a checkout session for a subscription and return the url', async () => {
    const subscriptionItem = {
      ...mockActiveCartItem,
      reservation: { ...mockActiveCartItem.reservation, isSubscription: true },
    };

    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([subscriptionItem as any]);
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    const url = await createCheckoutSession(buyerId, validPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Carrots', description: 'Recurring CSA Subscription' },
            unit_amount: 50,
            recurring: {
              interval: 'day',
              interval_count: 7, // Derived from item.product.harvestFrequencyDays
            },
          },
          quantity: 16,
        },
      ],
      mode: 'subscription',
      success_url: 'http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3000/cart',
      subscription_data: {
        application_fee_percent: 2, // 0.02 * 100
        transfer_data: { destination: 'acct_stripe123' },
      },
      metadata: {
        buyerId,
        sellerId: 'seller_123',
        reservationIds: 'res_1',
        fulfillmentType: 'pickup',
        scheduledTime: validPayload.scheduledTime,
      },
    });

    expect(url).toBe('https://checkout.stripe.com/test_url');
  });
});
