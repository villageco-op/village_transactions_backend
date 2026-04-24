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
          produceType: 'Apples',
          pricePerOz: '0.50',
          totalOzInventory: '1000',
          harvestFrequencyDays: 7,
          seasonStart: new Date('2024-01-01'),
          seasonEnd: new Date('2024-12-31'),
        },
        {
          sellerId: SELLER_2_ID,
          title: 'Organic Carrots',
          produceType: 'Carrots',
          pricePerOz: '0.20',
          totalOzInventory: '2000',
          harvestFrequencyDays: 14,
          seasonStart: new Date('2024-01-01'),
          seasonEnd: new Date('2024-12-31'),
        },
      ])
      .returning();

    const now = new Date();
    const [order1, order2, pendingOrder] = await testDb
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
          createdAt: new Date('2024-04-15T10:00:00Z'), // Spring (Month 4)
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '20.00',
          createdAt: new Date('2024-07-15T10:00:00Z'), // Summer (Month 7)
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'pending',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '10.00',
          createdAt: new Date('2024-10-15T10:00:00Z'), // Fall (Month 10)
        },
      ])
      .returning();

    await testDb.insert(orderItems).values([
      { orderId: order1.id, productId: apples.id, quantityOz: '100', pricePerOz: '0.50' }, // Spend: $50
      { orderId: order2.id, productId: carrots.id, quantityOz: '100', pricePerOz: '0.20' }, // Spend: $20
      { orderId: pendingOrder.id, productId: apples.id, quantityOz: '20', pricePerOz: '0.50' },
    ]);
  });

  describe('getNodes', () => {
    it('should aggregate correct map nodes for completed orders only', async () => {
      const nodes = await sourceMapRepository.getNodes({ buyerId: BUYER_ID });

      expect(nodes).toHaveLength(2);

      const farmOne = nodes[0];
      expect(farmOne.sellerId).toBe(SELLER_1_ID);
      expect(Number(farmOne.totalVolumeOz)).toBe(100);
      expect(Number(farmOne.totalSpend)).toBe(50);
      expect(farmOne.produceCategories).toEqual(['Apples']);

      const farmTwo = nodes[1];
      expect(farmTwo.sellerId).toBe(SELLER_2_ID);
      expect(Number(farmTwo.totalVolumeOz)).toBe(100);
      expect(Number(farmTwo.totalSpend)).toBe(20);
      expect(farmTwo.produceCategories).toEqual(['Carrots']);
    });

    it('should filter nodes by produceType', async () => {
      const carrotsNodes = await sourceMapRepository.getNodes({
        buyerId: BUYER_ID,
        produceType: 'Carrots',
      });
      expect(carrotsNodes).toHaveLength(1);
      expect(carrotsNodes[0].produceCategories).toContain('Carrots');

      const applesNodes = await sourceMapRepository.getNodes({
        buyerId: BUYER_ID,
        produceType: 'Apples',
      });
      expect(applesNodes).toHaveLength(1);
      expect(applesNodes[0].produceCategories).toContain('Apples');
    });

    it('should filter nodes by season', async () => {
      const springNodes = await sourceMapRepository.getNodes({
        buyerId: BUYER_ID,
        season: 'spring',
      });
      expect(springNodes).toHaveLength(1);
      expect(springNodes[0].produceCategories).toContain('Apples');

      const winterNodes = await sourceMapRepository.getNodes({
        buyerId: BUYER_ID,
        season: 'winter',
      });
      expect(winterNodes).toHaveLength(0);

      const allNodes = await sourceMapRepository.getNodes({
        buyerId: BUYER_ID,
        season: 'all',
      });
      expect(allNodes).toHaveLength(2);
    });
  });

  describe('getAnalytics', () => {
    it('should aggregate across completed, completed, and active statuses', async () => {
      const analytics = await sourceMapRepository.getAnalytics({ buyerId: BUYER_ID });

      // Both order1 (completed) and order2 (completed) should be counted. pendingOrder is excluded.
      expect(Number(analytics.totals.totalOrders)).toBe(2);
      expect(Number(analytics.totals.uniqueGrowers)).toBe(2);
      expect(Number(analytics.totals.totalVolumeOz)).toBe(200); // 100 apples + 100 carrots
      expect(Number(analytics.totals.totalSpend)).toBe(70); // 50 + 20

      expect(analytics.breakdown).toHaveLength(2);
      const applesBreakdown = analytics.breakdown.find((b) => b.produceType === 'Apples');
      expect(Number(applesBreakdown?.volumeOz)).toBe(100);
    });

    it('should filter analytics correctly by produceType', async () => {
      const analytics = await sourceMapRepository.getAnalytics({
        buyerId: BUYER_ID,
        produceType: 'Carrots',
      });

      expect(Number(analytics.totals.totalVolumeOz)).toBe(100);
      expect(Number(analytics.totals.uniqueGrowers)).toBe(1);

      expect(analytics.breakdown).toHaveLength(1);
      expect(analytics.breakdown[0].produceType).toBe('Carrots');
    });

    it('should filter analytics correctly by season', async () => {
      const summerAnalytics = await sourceMapRepository.getAnalytics({
        buyerId: BUYER_ID,
        season: 'summer',
      });

      expect(Number(summerAnalytics.totals.totalVolumeOz)).toBe(100);
      expect(summerAnalytics.breakdown).toHaveLength(1);
      expect(summerAnalytics.breakdown[0].produceType).toBe('Carrots');

      const winterAnalytics = await sourceMapRepository.getAnalytics({
        buyerId: BUYER_ID,
        season: 'winter',
      });

      expect(Number(winterAnalytics.totals.totalVolumeOz)).toBe(0);
      expect(Number(winterAnalytics.totals.totalSpend)).toBe(0);
      expect(winterAnalytics.breakdown).toHaveLength(0);
    });
  });
});
