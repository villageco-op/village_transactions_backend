import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { users, produce, subscriptions } from '../../../src/db/schema.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import * as stripeService from '../../../src/services/stripe.service.js';

vi.spyOn(stripeService, 'updateStripeSubscriptionStatus').mockResolvedValue(undefined);

describe('Subscriptions API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_integration_sub_test';
  const SELLER_ID = 'seller_integration_sub_test';
  let testSubscriptionId: string;

  beforeAll(() => {
    testDb = getTestDb();
    subscriptionRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: BUYER_ID, email: 'buyer.sub@example.com', name: 'Sub Buyer' },
      { id: SELLER_ID, email: 'seller.sub@example.com', name: 'Sub Seller' },
    ]);

    const [testProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Weekly Tomatoes',
        pricePerOz: '0.20',
        totalOzInventory: '1000',
        harvestFrequencyDays: 7,
        seasonStart: '2025-01-01',
        seasonEnd: '2025-12-31',
        isSubscribable: true,
      })
      .returning();

    const [insertedSub] = await testDb
      .insert(subscriptions)
      .values({
        buyerId: BUYER_ID,
        productId: testProduce.id,
        stripeSubscriptionId: 'stripe_sub_int_123',
        quantityOz: '10',
        status: 'active',
        fulfillmentType: 'pickup',
      })
      .returning();

    testSubscriptionId = insertedSub.id;
  });

  it('PUT /api/subscriptions/:id/status should return 401 if unauthorized', async () => {
    const res = await authedRequest(
      `/api/subscriptions/${testSubscriptionId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      },
      { id: '' }, // Unauthenticated override
    );

    expect(res.status).toBe(401);
  });

  it('PUT /api/subscriptions/:id/status should return 404 if subscription not found or owned by another user', async () => {
    const res = await authedRequest(
      `/api/subscriptions/${testSubscriptionId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      },
      { id: 'wrong_buyer_id' },
    );

    expect(res.status).toBe(404);
  });

  it('PUT /api/subscriptions/:id/status should return 200, update DB, and call Stripe mock when successful', async () => {
    const res = await authedRequest(
      `/api/subscriptions/${testSubscriptionId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      },
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const [dbSub] = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, testSubscriptionId));

    expect(dbSub.status).toBe('paused');

    expect(stripeService.updateStripeSubscriptionStatus).toHaveBeenCalledWith(
      'stripe_sub_int_123',
      'paused',
    );
  });
});
