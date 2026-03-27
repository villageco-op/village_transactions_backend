import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { sellerRepository } from '../../../src/repositories/seller.repository.js';
import { users, produce, orders, orderItems } from '../../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('SellerRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'seller_repo_123';
  const BUYER_ID = 'buyer_repo_123';

  beforeAll(() => {
    testDb = getTestDb();
    sellerRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: BUYER_ID, name: 'Consumer' },
      {
        id: SELLER_ID,
        name: 'Farmer Bob',
        goal: '1500',
        address: '123 Berry Ln',
        location: sql`ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography`,
      },
    ]);

    const [produceCorn, produceBeans] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_ID,
          title: 'Corn',
          pricePerOz: '0.50',
          totalOzInventory: '500',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_ID,
          title: 'Beans',
          pricePerOz: '1.00',
          totalOzInventory: '500',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
      ])
      .returning();

    const now = new Date();

    const lastMonth = new Date(now);
    lastMonth.setMonth(now.getMonth() - 1);

    const [orderThisMonth, orderLastMonth] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '100.00',
          createdAt: now,
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: lastMonth,
          totalAmount: '200.00',
          createdAt: lastMonth,
        },
      ])
      .returning();

    await testDb.insert(orderItems).values([
      {
        orderId: orderThisMonth.id,
        productId: produceCorn.id,
        quantityOz: '100', // 100 * 0.50 = 50.00
        pricePerOz: '0.50',
      },
      {
        orderId: orderThisMonth.id,
        productId: produceBeans.id,
        quantityOz: '50', // 50 * 1.00 = 50.00
        pricePerOz: '1.00',
      },
      {
        orderId: orderLastMonth.id,
        productId: produceCorn.id,
        quantityOz: '400', // 400 * 0.50 = 200.00
        pricePerOz: '0.50',
      },
    ]);
  });

  describe('getEarningsMetrics', () => {
    it('should aggregate financial values spanning different months', async () => {
      const data = await sellerRepository.getEarningsMetrics(SELLER_ID);

      expect(Number(data.goal)).toBe(1500);

      const agg = data.aggregates;
      expect(Number(agg?.earnedThisMonth)).toBe(100);
      expect(Number(agg?.earnedLastMonth)).toBe(200);
      expect(Number(agg?.totalEarnedLifetime)).toBe(300);

      expect(Number(data.weightAgg?.totalOzLifetime)).toBe(550);

      const cornSales = data.produceSalesThisMonth.find((p) => p.produceName === 'Corn');
      const beanSales = data.produceSalesThisMonth.find((p) => p.produceName === 'Beans');

      expect(Number(cornSales?.amount)).toBe(50);
      expect(Number(beanSales?.amount)).toBe(50);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should fetch profile data and current month aggregates', async () => {
      const data = await sellerRepository.getDashboardMetrics(SELLER_ID);

      expect(data.seller?.address).toBe('123 Berry Ln');
      expect(data.seller?.lat).toBeCloseTo(37.7749);
      expect(data.seller?.lng).toBeCloseTo(-122.4194);

      expect(Number(data.aggregates?.earnedThisMonth)).toBe(100);
      expect(Number(data.aggregates?.earnedLastMonth)).toBe(200);

      expect(Number(data.weeklySales?.soldThisWeekOz)).toBe(150);

      const corn = data.produceSalesThisMonth.find((p) => p.produceName === 'Corn');
      expect(Number(corn?.earned)).toBe(50);
    });
  });
});
