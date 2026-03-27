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
    reservation: { id: 'res_1', quantityOz: '16' },
    product: {
      id: 'prod_1',
      title: 'Carrots',
      status: 'active',
      totalOzInventory: '100',
      pricePerOz: '0.50',
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

  it('should throw a 400 if inventory is insufficient', async () => {
    const invalidItem = {
      ...mockActiveCartItem,
      product: { ...mockActiveCartItem.product, totalOzInventory: '10' }, // Less than reserved 16
    };
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([invalidItem as any]);

    await expect(createCheckoutSession(buyerId, validPayload)).rejects.toThrow(
      /Insufficient inventory/,
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

  it('should successfully create a checkout session and return the url', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([mockActiveCartItem as any]);
    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockSellerUser as any);

    const url = await createCheckoutSession(buyerId, validPayload);

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Carrots', description: '16 oz' },
            unit_amount: 800, // 0.50 * 16 * 100
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'http://localhost:3000/cart',
      payment_intent_data: {
        application_fee_amount: 200,
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
