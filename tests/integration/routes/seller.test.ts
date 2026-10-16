import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import {
  users,
  orders,
  orderItems,
  produce,
  subscriptions,
  reviews,
} from '../../../src/db/schema.js';
import { sellerRepository } from '../../../src/repositories/seller.repository.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { request } from '../../test-utils/request.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';

describe('Seller API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'seller_integration_abc';
  const BUYER_ID = 'buyer_integration_abc';

  beforeAll(() => {
    testDb = getTestDb();
    orderRepository.setDb(testDb);
    subscriptionRepository.setDb(testDb);
    sellerRepository.setDb(testDb);
    produceRepository.setDb(testDb);
    userRepository.setDb(testDb);
    reviewRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: BUYER_ID, name: 'Alice', email: 'alice@test.com' },
      { id: SELLER_ID, name: 'Bob Seller', email: 'bob@seller.com', goal: '1000' },
    ]);

    const [testProduct] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Fresh Berries',
        pricePerOz: '1.20',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: '2025-01-01',
        seasonEnd: '2025-12-31',
      })
      .returning();

    const [completedOrder] = await testDb
      .insert(orders)
      .values({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'cs_test_payout',
        status: 'completed',
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        createdAt: new Date(),
        totalAmount: '19.20',
        paymentMethod: 'card',
      })
      .returning();

    await testDb.insert(orderItems).values({
      orderId: completedOrder.id,
      productId: testProduct.id,
      quantityOz: '16',
      pricePerOz: '1.20',
    });

    await testDb.insert(orders).values({
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      stripeSessionId: 'cs_test_pending',
      status: 'pending',
      fulfillmentType: 'pickup',
      scheduledTime: new Date(),
      createdAt: new Date(),
      totalAmount: '12.00',
      paymentMethod: 'card',
    });

    await testDb.insert(subscriptions).values({
      buyerId: BUYER_ID,
      productId: testProduct.id,
      quantityOz: '10.00',
      status: 'active',
      fulfillmentType: 'pickup',
    });
  });

  describe('GET /api/seller/payouts', () => {
    it('should return 200 and formatted payout data for authenticated seller', async () => {
      const res = await authedRequest(
        '/api/seller/payouts?timeframe=30days',
        {},
        { id: SELLER_ID },
      );

      expect(res.status).toBe(200);

      const { data } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);

      const payoutLine = data[0];
      expect(payoutLine).toMatchObject({
        buyerName: 'Alice',
        productName: 'Fresh Berries',
        quantityLbs: 1,
        amountDollars: 19.2,
      });
      expect(payoutLine.date).toBeDefined();
    });

    it('should fallback cleanly when timeframe query parameter is missing', async () => {
      const res = await authedRequest('/api/seller/payouts', {}, { id: SELLER_ID });

      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
    });
  });

  describe('GET /api/seller/earnings', () => {
    it('should map the raw repository metrics into the formatted earnings schema', async () => {
      const res = await authedRequest('/api/seller/earnings', {}, { id: SELLER_ID });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.monthlyGoal).toBe(1000);
      expect(body.earnedThisMonth).toBe(19.2); // $19.20 made this month
      expect(body.remainingToGoal).toBe(980.8); // 1000 - 19.20
      expect(body.avgPerLbSold).toBe(19.2); // $19.20 total / 1 lb total

      expect(body.amountSoldDollarsPerProduceThisMonth).toHaveLength(1);
      expect(body.amountSoldDollarsPerProduceThisMonth[0]).toMatchObject({
        produceName: 'Fresh Berries',
        amount: 19.2,
      });
    });
  });

  describe('GET /api/seller/dashboard', () => {
    it('should return 200 and formatted dashboard data for authenticated seller', async () => {
      const res = await authedRequest('/api/seller/dashboard', {}, { id: SELLER_ID });
      expect(res.status).toBe(200);

      const body = await res.json();

      expect(body.monthlyGoal).toBe(1000);
      expect(body.earnedThisMonth).toBe(19.2);
      expect(body.completedOrdersThisMonth).toBe(1);
      expect(body.pendingOrders).toBe(1);
      expect(body.activeSubscriptions).toBe(1);
      expect(body.earningsByProduceThisMonth).toHaveLength(1);
      expect(body.earningsByProduceThisMonth[0]).toMatchObject({
        produceName: 'Fresh Berries',
        amount: 19.2,
      });
      expect(body.sellerLocation).toHaveProperty('lat');
      expect(body.sellerLocation).toHaveProperty('lng');
      expect(body.sellerLocation).toHaveProperty('address');
    });
  });

  describe('GET /api/seller/:id', () => {
    const SELLER_ID = 'public_seller_123';
    const BUYER_1_ID = 'public_buyer_1';
    const BUYER_2_ID = 'public_buyer_2';

    beforeEach(async () => {
      await testDb.insert(users).values([
        {
          id: SELLER_ID,
          name: 'Farmer John',
          email: 'john@example.com',
          aboutMe: 'Farm life',
          specialties: ['corn', 'beans'],
          city: 'Omaha',
          createdAt: new Date('2023-01-01'),
        },
        { id: BUYER_1_ID, name: 'Buyer 1', email: 'b1@example.com' },
        { id: BUYER_2_ID, name: 'Buyer 2', email: 'b2@example.com' },
      ]);

      const orderId1 = '11111111-1111-1111-1111-111111111111';
      const orderId2 = '22222222-2222-2222-2222-222222222222';

      await testDb.insert(orders).values([
        {
          id: orderId1,
          buyerId: BUYER_1_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
          createdAt: new Date(), // This month
        },
        {
          id: orderId2,
          buyerId: BUYER_2_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '15',
          createdAt: new Date(), // This month
        },
      ]);

      await testDb.insert(reviews).values([
        {
          buyerId: BUYER_1_ID,
          sellerId: SELLER_ID,
          orderId: orderId1,
          rating: 5,
          comment: 'Great!',
        },
        { buyerId: BUYER_2_ID, sellerId: SELLER_ID, orderId: orderId2, rating: 4, comment: 'Good' },
      ]);
    });

    it('should return public profile with stats and exclude sensitive info', async () => {
      const res = await request(`/api/seller/${SELLER_ID}`);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.id).toBe(SELLER_ID);
      expect(body.name).toBe('Farmer John');
      expect(body.city).toBe('Omaha');
      expect(body.aboutMe).toBe('Farm life');
      expect(body.specialties).toEqual(['corn', 'beans']);
      expect(body.joinedAt).toBeDefined();

      expect(body).not.toHaveProperty('email');

      expect(body.totalReviews).toBe(2);
      expect(body.starRating).toBe(4.5); // (5 + 4) / 2
      expect(body.reviewBreakdown).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 });
      expect(body.activeBuyerCount).toBe(2);
    });

    it('should return 404 for missing user', async () => {
      const res = await request('/api/seller/not-found');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('User not found');
    });
  });
});
