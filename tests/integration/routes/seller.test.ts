import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { users, orders, orderItems, produce } from '../../../src/db/schema.js';
import { sellerRepository } from '../../../src/repositories/seller.repository.js';

describe('Seller API', () => {
  const SELLER_ID = 'seller_integration_abc';
  it('GET /api/seller/customers should return 200', async () => {
    const res = await authedRequest('/api/seller/customers', {}, { id: SELLER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/seller/analytics should return 200', async () => {
    const res = await authedRequest('/api/seller/analytics?timeframe=30d', {}, { id: SELLER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  });
});

describe('Seller API Integration - Payouts', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'seller_integration_abc';
  const BUYER_ID = 'buyer_integration_abc';

  beforeAll(() => {
    testDb = getTestDb();
    orderRepository.setDb(testDb);
    sellerRepository.setDb(testDb);
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
  });

  describe('GET /api/seller/payouts', () => {
    it('should return 200 and formatted payout data for authenticated seller', async () => {
      const res = await authedRequest(
        '/api/seller/payouts?timeframe=30days',
        {},
        { id: SELLER_ID },
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);

      const payoutLine = body[0];
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
      const body = await res.json();

      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
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
});
