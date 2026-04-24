import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { sourceMapRepository } from '../../../src/repositories/source-map.repository.js';
import { users, orders, orderItems, produce } from '../../../src/db/schema.js';

describe('SourceMapRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_123';
  const SELLER_1_ID = 'seller_1';
  const SELLER_2_ID = 'seller_2';

  beforeAll(() => {
    testDb = getTestDb();
    sourceMapRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: BUYER_ID, name: 'Map Buyer' },
      { id: SELLER_1_ID, name: 'Farm One', lat: 41.8, lng: -87.6 },
      { id: SELLER_2_ID, name: 'Farm Two', lat: 42.0, lng: -88.0 },
    ]);

    const [apples, carrots] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_1_ID,
          title: 'Fresh Apples',
          produceType: 'stone_fruits',
          pricePerOz: '0.50',
          totalOzInventory: '1000',
          harvestFrequencyDays: 7,
          seasonStart: new Date('2024-01-01'),
          seasonEnd: new Date('2024-12-31'),
        },
        {
          sellerId: SELLER_2_ID,
          title: 'Organic Carrots',
          produceType: 'root_vegetables',
          pricePerOz: '0.20',
          totalOzInventory: '2000',
          harvestFrequencyDays: 14,
          seasonStart: new Date('2024-01-01'),
          seasonEnd: new Date('2024-12-31'),
        },
      ])
      .returning();

    const now = new Date();
    const [order1, order2, pendingOrder, refundPendingOrder, canceledOrder] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '50.00',
          createdAt: new Date('2024-04-15T10:00:00Z'), // Spring
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '20.00',
          createdAt: new Date('2024-07-15T10:00:00Z'), // Summer
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'pending', // Should be INCLUDED
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '10.00',
          createdAt: new Date('2024-10-15T10:00:00Z'), // Fall
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'refund_pending', // Should be EXCLUDED
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '30.00',
          createdAt: new Date('2024-04-20T10:00:00Z'),
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'canceled', // Should be EXCLUDED
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '40.00',
          createdAt: new Date('2024-07-20T10:00:00Z'),
        },
      ])
      .returning();

    await testDb.insert(orderItems).values([
      { orderId: order1.id, productId: apples.id, quantityOz: '100', pricePerOz: '0.50' }, // $50
      { orderId: order2.id, productId: carrots.id, quantityOz: '100', pricePerOz: '0.20' }, // $20
      { orderId: pendingOrder.id, productId: apples.id, quantityOz: '20', pricePerOz: '0.50' }, // $10
      {
        orderId: refundPendingOrder.id,
        productId: apples.id,
        quantityOz: '60',
        pricePerOz: '0.50',
      }, // Should not count
      { orderId: canceledOrder.id, productId: carrots.id, quantityOz: '200', pricePerOz: '0.20' }, // Should not count
    ]);
  });

  describe('getNodes', () => {
    it('should aggregate correct map nodes excluding canceled and refund_pending', async () => {
      const nodes = await sourceMapRepository.getNodes({ buyerId: BUYER_ID });

      // Only Farm One (order1 + pendingOrder) and Farm Two (order2) should appear
      expect(nodes).toHaveLength(2);

      const farmOne = nodes.find((n) => n.sellerId === SELLER_1_ID);
      // order1 (100) + pendingOrder (20) = 120. refundPendingOrder is ignored.
      expect(Number(farmOne?.totalVolumeOz)).toBe(120);
      expect(Number(farmOne?.totalSpend)).toBe(60); // 50 + 10

      const farmTwo = nodes.find((n) => n.sellerId === SELLER_2_ID);
      // order2 (100). canceledOrder is ignored.
      expect(Number(farmTwo?.totalVolumeOz)).toBe(100);
      expect(Number(farmTwo?.totalSpend)).toBe(20);
    });
  });

  describe('getAnalytics', () => {
    it('should exclude orders with status canceled or refund_pending', async () => {
      const analytics = await sourceMapRepository.getAnalytics({ buyerId: BUYER_ID });

      // order1, order2, and pendingOrder = 3 orders.
      // refundPendingOrder and canceledOrder are excluded.
      expect(Number(analytics.totals.totalOrders)).toBe(3);
      expect(Number(analytics.totals.uniqueGrowers)).toBe(2);
      expect(Number(analytics.totals.totalVolumeOz)).toBe(220); // 100 + 100 + 20
      expect(Number(analytics.totals.totalSpend)).toBe(80); // 50 + 20 + 10

      expect(analytics.breakdown).toHaveLength(2);
      const applesBreakdown = analytics.breakdown.find((b) => b.produceType === 'stone_fruits');
      expect(Number(applesBreakdown?.volumeOz)).toBe(120); // 100 + 20
    });

    it('should filter analytics correctly by season while respecting status exclusions', async () => {
      // Spring has order1 (completed) and refundPendingOrder (refund_pending)
      const springAnalytics = await sourceMapRepository.getAnalytics({
        buyerId: BUYER_ID,
        season: 'spring',
      });

      // Only order1 should be counted
      expect(Number(springAnalytics.totals.totalOrders)).toBe(1);
      expect(Number(springAnalytics.totals.totalVolumeOz)).toBe(100);
      expect(springAnalytics.breakdown[0].produceType).toBe('stone_fruits');
    });
  });
});
