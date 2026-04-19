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
import { userRepository } from '../../../src/repositories/user.repository.js';

vi.spyOn(stripeService, 'updateStripeSubscriptionStatus').mockResolvedValue(undefined);

describe('Subscriptions API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_integration_sub_test';
  const SELLER_ID = 'seller_integration_sub_test';
  const RANDOM_USER_ID = 'random_user_test';
  let testSubscriptionId: string;

  beforeAll(() => {
    testDb = getTestDb();
    subscriptionRepository.setDb(testDb);
    userRepository.setDb(testDb);
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
      { id: RANDOM_USER_ID, email: 'random.user@example.com', name: 'Random User' },
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

  describe('Update Subscription Status', () => {
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

  describe('Subscriptions Details', () => {
    it('GET /api/subscriptions/:id should return 401 if unauthorized', async () => {
      const res = await authedRequest(
        `/api/subscriptions/${testSubscriptionId}`,
        { method: 'GET' },
        { id: '' }, // Unauthenticated
      );

      expect(res.status).toBe(401);
    });

    it('GET /api/subscriptions/:id should return 404 if the user is neither the buyer nor seller', async () => {
      const res = await authedRequest(
        `/api/subscriptions/${testSubscriptionId}`,
        { method: 'GET' },
        { id: RANDOM_USER_ID }, // Exists, but has no relation to the sub
      );

      expect(res.status).toBe(404);
    });

    it('GET /api/subscriptions/:id should return 404 if subscription does not exist', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await authedRequest(
        `/api/subscriptions/${fakeId}`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(404);
    });

    it('GET /api/subscriptions/:id should return 200 and subscription details when called by the buyer', async () => {
      const res = await authedRequest(
        `/api/subscriptions/${testSubscriptionId}`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(testSubscriptionId);
      expect(body.buyerId).toBe(BUYER_ID);
      expect(body.quantityOz).toBe('10.00');
      expect(body.stripeSubscriptionId).toBeUndefined(); // Should be stripped

      // Assert that populated nested entities exist
      expect(body.product).toBeDefined();
      expect(body.product.title).toBe('Weekly Tomatoes');

      expect(body.buyer).toBeDefined();
      expect(body.buyer.name).toBe('Sub Buyer');

      expect(body.seller).toBeDefined();
      expect(body.seller.name).toBe('Sub Seller');
    });

    it('GET /api/subscriptions/:id should return 200 and subscription details when called by the seller', async () => {
      const res = await authedRequest(
        `/api/subscriptions/${testSubscriptionId}`,
        { method: 'GET' },
        { id: SELLER_ID },
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(testSubscriptionId);
      expect(body.buyerId).toBe(BUYER_ID);
      expect(body.product.title).toBe('Weekly Tomatoes');
    });
  });

  describe('Get Subscriptions List', () => {
    beforeEach(async () => {
      // Seed an extra subscription so we have multiple items to paginate
      const [testProduce] = await testDb
        .select()
        .from(produce)
        .where(eq(produce.sellerId, SELLER_ID));

      await testDb.insert(subscriptions).values({
        buyerId: BUYER_ID,
        productId: testProduce.id,
        quantityOz: '15',
        status: 'paused',
        fulfillmentType: 'delivery',
      });
    });

    it('GET /api/subscriptions should return 401 if unauthorized', async () => {
      const res = await authedRequest(`/api/subscriptions`, { method: 'GET' }, { id: '' });
      expect(res.status).toBe(401);
    });

    it('GET /api/subscriptions should return 403 if querying a different buyer ID', async () => {
      const res = await authedRequest(
        `/api/subscriptions?buyerId=${BUYER_ID}`,
        { method: 'GET' },
        { id: RANDOM_USER_ID }, // Acting as random user
      );
      expect(res.status).toBe(403);
    });

    it('GET /api/subscriptions should return 403 if querying a different seller ID', async () => {
      const res = await authedRequest(
        `/api/subscriptions?sellerId=${SELLER_ID}`,
        { method: 'GET' },
        { id: BUYER_ID }, // Acting as buyer trying to query seller's global list
      );
      expect(res.status).toBe(403);
    });

    it('GET /api/subscriptions should successfully return a paginated list for a valid buyer context', async () => {
      const res = await authedRequest(
        `/api/subscriptions?page=1&limit=10`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      expect(body.data).toHaveLength(2);
      expect(body.data[0].buyerId).toBe(BUYER_ID);
      expect(body.data[0].product.sellerId).toBe(SELLER_ID);
      expect(body.data[0].buyer).toBeDefined();
      expect(body.data[0].seller).toBeDefined();
    });

    it('GET /api/subscriptions should filter by status successfully', async () => {
      const res = await authedRequest(
        `/api/subscriptions?status=paused&limit=5`,
        { method: 'GET' },
        { id: SELLER_ID }, // Seller can query their own paused subs
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('paused');
    });
  });
});
