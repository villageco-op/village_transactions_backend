import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { users, produce, orders, orderItems } from '../../../src/db/schema.js';

describe('BuyerRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_repo_integration_123';
  const SELLER_1_ID = 'seller_repo_1_123';
  const SELLER_2_ID = 'seller_repo_2_123';

  beforeAll(() => {
    testDb = getTestDb();
    buyerRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      {
        id: BUYER_ID,
        city: 'Chicago',
        lat: 41.8781,
        lng: -87.6298,
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`,
      },
      {
        id: SELLER_1_ID,
        name: 'Local Seller',
        city: 'Chicago',
        lat: 41.8819,
        lng: -87.6231,
        location: sql`ST_SetSRID(ST_MakePoint(-87.6231, 41.8819), 4326)`,
      },
      {
        id: SELLER_2_ID,
        name: 'Far Seller',
        city: 'Springfield',
        lat: 39.7817,
        lng: -89.6501,
        location: sql`ST_SetSRID(ST_MakePoint(-89.6501, 39.7817), 4326)`,
      },
    ]);

    const [produceSpinach, produceCarrots, produceApples] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_1_ID,
          title: 'Spinach',
          produceType: 'leafy_greens',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_1_ID,
          title: 'Carrots',
          produceType: 'root_vegetables',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_2_ID,
          title: 'Apples',
          produceType: 'stone_fruits',
          pricePerOz: '2.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
      ])
      .returning();

    const now = new Date();
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(now.getMonth() - 2);

    const [orderPast1, orderCurrent1, orderCurrent2, orderPending2] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: twoMonthsAgo,
          totalAmount: '10.00',
          createdAt: twoMonthsAgo,
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '20.00',
          createdAt: now,
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '30.00',
          createdAt: now,
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'pending',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '100.00',
          createdAt: now,
        },
      ])
      .returning();

    await testDb.insert(orderItems).values([
      {
        orderId: orderPast1.id,
        productId: produceSpinach.id,
        quantityOz: '10',
        pricePerOz: '1.00',
      },
      {
        orderId: orderCurrent1.id,
        productId: produceCarrots.id,
        quantityOz: '20',
        pricePerOz: '1.00',
      },
      {
        orderId: orderCurrent2.id,
        productId: produceApples.id,
        quantityOz: '15',
        pricePerOz: '2.00',
      },
      {
        orderId: orderPending2.id,
        productId: produceApples.id,
        quantityOz: '50',
        pricePerOz: '2.00',
      },
    ]);
  });

  it('should accurately aggregate growers stats including unpaginated cities list', async () => {
    const results = await buyerRepository.getGrowersByBuyerId(BUYER_ID, 20, 0);

    expect(results.cities.sort()).toEqual(['Chicago', 'Springfield'].sort());

    const seller1 = results.items.find((r) => r.sellerId === SELLER_1_ID);
    expect(seller1?.city).toBe('Chicago');
  });

  it('should filter growers by text search for produce or seller name', async () => {
    const searchProduceResult = await buyerRepository.getGrowersByBuyerId(
      BUYER_ID,
      20,
      0,
      'spinach',
    );
    expect(searchProduceResult.items).toHaveLength(1);
    expect(searchProduceResult.items[0].sellerId).toBe(SELLER_1_ID);

    const searchNameResult = await buyerRepository.getGrowersByBuyerId(
      BUYER_ID,
      20,
      0,
      'Far Seller',
    );
    expect(searchNameResult.items).toHaveLength(1);
    expect(searchNameResult.items[0].sellerId).toBe(SELLER_2_ID);
  });

  it('should filter growers by maxDistance from buyer location', async () => {
    // Buyer is in Chicago. 10 mile radius should only catch SELLER_1 (also in Chicago)
    const distanceFilter = { lat: 41.8781, lng: -87.6298, maxDistance: 10 };

    const results = await buyerRepository.getGrowersByBuyerId(
      BUYER_ID,
      20,
      0,
      undefined,
      distanceFilter,
    );

    expect(results.items).toHaveLength(1);
    expect(results.items[0].sellerId).toBe(SELLER_1_ID);
    expect(results.cities).toEqual(['Chicago']);
  });

  describe('getBuyerWithOrdersForSummary', () => {
    it('should correctly flag isLocal using PostGIS and City columns', async () => {
      const summaryData = await buyerRepository.getBuyerWithOrdersForSummary(BUYER_ID);

      const localOrder = summaryData.orders.find((o) => o.isLocal === true);
      const nonLocalOrder = summaryData.orders.find((o) => o.isLocal === false);

      expect(localOrder).toBeDefined(); // Seller 1 (Chicago)
      expect(nonLocalOrder).toBeDefined(); // Seller 2 (Springfield)
    });
  });

  describe('getDashboardMetrics', () => {
    it('should aggregate spend and weight for the current period', async () => {
      const metrics = await buyerRepository.getDashboardMetrics(BUYER_ID);

      // Spend Aggregations
      // Current Month: orderCurrent1 ($20) + orderCurrent2 ($30) + orderPending2 ($100) = $150
      // Last Month: 0 (orderPast1 was 2 months ago)
      expect(Number(metrics.spendAgg?.spendThisMonth)).toBe(150);
      expect(Number(metrics.spendAgg?.spendLastMonth)).toBe(0);

      // Weight Aggregations
      // Current Week: orderCurrent1 (20oz) + orderCurrent2 (15oz) + orderPending2 (50oz) = 85oz
      // Last Week: 0
      expect(Number(metrics.weightAgg?.ozThisWeek)).toBe(85);
      expect(Number(metrics.weightAgg?.ozLastWeek)).toBe(0);
    });

    it('should correctly calculate grower distances and flag local growers', async () => {
      const metrics = await buyerRepository.getDashboardMetrics(BUYER_ID);

      // Should return both SELLER_1 and SELLER_2 because neither are 'canceled'
      expect(metrics.growers).toHaveLength(2);

      const seller1 = metrics.growers.find((g) => g.sellerId === SELLER_1_ID);
      const seller2 = metrics.growers.find((g) => g.sellerId === SELLER_2_ID);

      expect(seller1).toBeDefined();
      expect(seller2).toBeDefined();

      // Seller 1 is in Chicago, same as Buyer. Distance should be very small (< 1 mile).
      expect(seller1?.isLocal).toBe(true); // Matches city name logic
      expect(Number(seller1?.distance)).toBeGreaterThan(0);
      expect(Number(seller1?.distance)).toBeLessThan(1);

      // Seller 2 is in Springfield. Distance is far (> 100 miles).
      expect(seller2?.isLocal).toBe(false); // Different city AND > 50 miles away
      expect(Number(seller2?.distance)).toBeGreaterThan(100);
    });
  });
});
