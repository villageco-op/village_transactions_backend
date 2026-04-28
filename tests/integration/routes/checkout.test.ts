import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, Mocked } from 'vitest';
import Stripe from 'stripe';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce } from '../../../src/db/schema.js';
import { __setStripeClient } from '../../../src/services/stripe.service.js';

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/integration-session' }),
    },
  },
} as unknown as Mocked<Stripe>;

describe('Checkout API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_user_123';
  const SELLER_ID = 'seller_user_456';

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
    cartRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
    __setStripeClient(mockStripe);

    await testDb.insert(users).values([
      { id: BUYER_ID, email: 'buyer@example.com', name: 'Buyer' },
      {
        id: SELLER_ID,
        email: 'seller@example.com',
        name: 'Seller',
        stripeAccountId: 'acct_seller123',
        stripeOnboardingComplete: true,
      },
    ]);
  });

  describe('POST /api/checkout/stripe/session', () => {
    it('should return 401 if unauthorized', async () => {
      const res = await authedRequest(
        '/api/checkout/stripe/session',
        {
          method: 'POST',
          body: JSON.stringify({ groupId: 'some-uuid' }),
        },
        { id: '' },
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 if groupId is missing from payload', async () => {
      const res = await authedRequest(
        '/api/checkout/stripe/session',
        { method: 'POST', body: JSON.stringify({}) },
        { id: BUYER_ID },
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 if the checkout group does not exist', async () => {
      const res = await authedRequest(
        '/api/checkout/stripe/session',
        {
          method: 'POST',
          body: JSON.stringify({ groupId: '00000000-0000-0000-0000-000000000000' }),
        },
        { id: BUYER_ID },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Checkout group not found or has expired.');
    });

    it('should return 200 and a Stripe URL for a valid cart group', async () => {
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Strawberries',
          pricePerOz: '0.50',
          totalOzInventory: '100',
          status: 'active',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2026-12-31',
        })
        .returning();

      // Use Repository to create the group + reservation correctly
      const reservation = await cartRepository.addToCart(BUYER_ID, {
        productId: p.id,
        quantityOz: 10,
        isSubscription: false,
      });

      // Perform Request
      const res = await authedRequest(
        '/api/checkout/stripe/session',
        {
          method: 'POST',
          body: JSON.stringify({ groupId: reservation.groupId }),
        },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe('https://checkout.stripe.com/integration-session');

      // Verify Stripe was called with correct metadata
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            buyerId: BUYER_ID,
            sellerId: SELLER_ID,
            groupId: reservation.groupId,
            reservationIds: reservation.id,
          }),
          line_items: expect.arrayContaining([
            expect.objectContaining({
              quantity: 10,
              price_data: expect.objectContaining({
                unit_amount: 50, // 0.50 * 100
              }),
            }),
          ]),
        }),
      );
    });

    it('should return 400 if a product in the group is no longer active', async () => {
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Ghost Peppers',
          pricePerOz: '1.00',
          totalOzInventory: '10',
          status: 'paused', // Service should reject this
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2026-12-31',
        })
        .returning();

      const reservation = await cartRepository.addToCart(BUYER_ID, {
        productId: p.id,
        quantityOz: 1,
        isSubscription: false,
      });

      const res = await authedRequest(
        '/api/checkout/stripe/session',
        {
          method: 'POST',
          body: JSON.stringify({ groupId: reservation.groupId }),
        },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Product is no longer available');
    });
  });

  describe('POST /api/checkout/snap/initiate', () => {
    it('POST /api/checkout/snap/initiate should return 200', async () => {
      const res = await authedRequest(
        '/api/checkout/snap/initiate',
        {
          method: 'POST',
          body: JSON.stringify({
            sellerId: 'seller_123',
            fulfillmentType: 'pickup',
          }),
        },
        { id: BUYER_ID },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });
});
