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
import { users, produce, cartReservations } from '../../../src/db/schema.js';
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

  it('POST /api/checkout/stripe/session should return 401 if unauthorized', async () => {
    const res = await authedRequest(
      '/api/checkout/stripe/session',
      {
        method: 'POST',
        body: JSON.stringify({
          sellerId: SELLER_ID,
          fulfillmentType: 'pickup',
          scheduledTime: new Date().toISOString(),
        }),
      },
      { id: '' },
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/checkout/stripe/session should return 400 if bad request body (schema validation)', async () => {
    const res = await authedRequest(
      '/api/checkout/stripe/session',
      { method: 'POST', body: JSON.stringify({ sellerId: SELLER_ID }) },
      { id: BUYER_ID },
    );
    expect(res.status).toBe(400);
  });

  it('POST /api/checkout/stripe/session should return 400 if no active cart items found for seller', async () => {
    const res = await authedRequest(
      '/api/checkout/stripe/session',
      {
        method: 'POST',
        body: JSON.stringify({
          sellerId: SELLER_ID,
          fulfillmentType: 'pickup',
          scheduledTime: new Date().toISOString(),
        }),
      },
      { id: BUYER_ID },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'No active reservations found for this seller.');
  });

  it('POST /api/checkout/stripe/session should return 200 with checkout URL when successfully processed', async () => {
    const [insertedProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Tomatoes',
        produceType: 'nightshades',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: new Date().toISOString(),
        seasonEnd: new Date(Date.now() + 86400000).toISOString(),
        status: 'active',
      })
      .returning();

    await testDb.insert(cartReservations).values({
      buyerId: BUYER_ID,
      productId: insertedProduce.id,
      quantityOz: '10',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const payload = {
      sellerId: SELLER_ID,
      fulfillmentType: 'pickup',
      scheduledTime: new Date().toISOString(),
    };

    const res = await authedRequest(
      '/api/checkout/stripe/session',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('url', 'https://checkout.stripe.com/integration-session');

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
  });

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
