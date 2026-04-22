import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users, produce, orders, orderItems } from '../../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Buyer API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_integration_test';
  const SELLER_1_ID = 'seller_1_test';
  const SELLER_2_ID = 'seller_2_test';

  beforeAll(() => {
    testDb = getTestDb();
    buyerRepository.setDb(testDb);
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      {
        id: BUYER_ID,
        email: 'buyer@example.com',
        name: 'Hungry Buyer',
        address: '123 House Ave, Ruraltown, CA 90000',
        city: 'Ruraltown',
        lat: 36.0,
        lng: -119.0,
        location: sql`ST_SetSRID(ST_MakePoint(36.0, -119.0), 4326)`,
      },
      {
        id: SELLER_1_ID,
        email: 'seller1@example.com',
        name: 'Farm One',
        address: '456 Dirt Rd, Ruraltown, CA 90000',
        city: 'Ruraltown',
        lat: 36.05, // Roughly 3.5 miles away from buyer
        lng: -119.0,
        location: sql`ST_SetSRID(ST_MakePoint(36.05, -119.0), 4326)`,
      },
      {
        id: SELLER_2_ID,
        email: 'seller2@example.com',
        name: 'Farm Two',
        address: '789 Apple Ave, Faraway, CA 90001',
        city: 'Faraway',
        lat: 37.0, // Substantially far away
        lng: -120.0,
        location: sql`ST_SetSRID(ST_MakePoint(37.0, -120.0), 4326)`,
      },
    ]);

    const [produce1, produce2, produce3] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_1_ID,
          title: 'Spinach Bag',
          produceType: 'spinach',
          pricePerOz: '1',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_1_ID,
          title: 'Carrots Pack',
          produceType: 'carrots',
          pricePerOz: '1',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_2_ID,
          title: 'Apples',
          produceType: 'apples',
          pricePerOz: '1',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
      ])
      .returning();

    const now = new Date();
    const pastMonth = new Date(now);
    pastMonth.setMonth(now.getMonth() - 2);

    const [order1, order2] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: pastMonth,
          totalAmount: '16.00',
          createdAt: pastMonth,
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_1_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '32.00',
          createdAt: now,
        },
      ])
      .returning();

    const [order3] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_2_ID,
          status: 'pending',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '16.00',
          createdAt: now,
        },
      ])
      .returning();

    await testDb.insert(orderItems).values([
      { orderId: order1.id, productId: produce1.id, quantityOz: '16', pricePerOz: '1' },
      { orderId: order2.id, productId: produce2.id, quantityOz: '32', pricePerOz: '1' },
      { orderId: order3.id, productId: produce3.id, quantityOz: '16', pricePerOz: '1' },
    ]);
  });
  describe('GET /api/buyer/growers', () => {
    it('GET /api/buyer/growers should return 401 if unauthorized', async () => {
      const res = await authedRequest(`/api/buyer/growers`, { method: 'GET' }, { id: '' });
      expect(res.status).toBe(401);
    });

    it('GET /api/buyer/growers should return aggregated list of sellers bought from with cities', async () => {
      const res = await authedRequest(`/api/buyer/growers`, { method: 'GET' }, { id: BUYER_ID });

      expect(res.status).toBe(200);
      const { data, meta, cities } = (await res.json()) as any;

      // Seller 2 should be omitted because their order is 'pending'
      expect(data).toHaveLength(1);
      expect(meta.total).toBe(1);
      expect(cities).toEqual(['Ruraltown']);

      const seller1Stats = data[0];

      expect(seller1Stats.sellerId).toBe(SELLER_1_ID);
      expect(seller1Stats.name).toBe('Farm One');
      expect(seller1Stats.location?.address).toBe('456 Dirt Rd, Ruraltown, CA 90000');

      expect(seller1Stats.produceTypesOrdered.sort()).toEqual(['carrots', 'spinach'].sort());

      expect(seller1Stats.amountOrderedThisMonthLbs).toBe(2);

      expect(seller1Stats.daysSinceFirstOrder).toBeGreaterThanOrEqual(57); // Roughly two months
      expect(new Date(seller1Stats.firstOrderDate).getTime()).toBeLessThan(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      );
    });

    it('GET /api/buyer/growers should respect text search query parameter', async () => {
      // Looking for spinach
      const resSpinach = await authedRequest(
        `/api/buyer/growers?search=spinach`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resSpinach.status).toBe(200);
      const bodySpinach = (await resSpinach.json()) as any;
      expect(bodySpinach.data).toHaveLength(1);
      expect(bodySpinach.data[0].sellerId).toBe(SELLER_1_ID);

      // Looking for an item they've never successfully ordered
      const resOranges = await authedRequest(
        `/api/buyer/growers?search=oranges`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resOranges.status).toBe(200);
      const bodyOranges = (await resOranges.json()) as any;
      expect(bodyOranges.data).toHaveLength(0);
    });

    it('GET /api/buyer/growers should respect maxDistance query parameter', async () => {
      // Seller 1 is ~3.5 miles away
      const resTooFar = await authedRequest(
        `/api/buyer/growers?maxDistance=1`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resTooFar.status).toBe(200);
      expect(((await resTooFar.json()) as any).data).toHaveLength(0);

      // Filter large enough to cover the 3.5 miles
      const resNear = await authedRequest(
        `/api/buyer/growers?maxDistance=10`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resNear.status).toBe(200);
      expect(((await resNear.json()) as any).data).toHaveLength(1);
    });
  });

  describe('GET /api/buyer/billing-summary', () => {
    it('GET /api/buyer/billing-summary should return aggregated financial stats', async () => {
      const res = await authedRequest(
        `/api/buyer/billing-summary`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;

      expect(body.totalSpent).toBe(48);
      expect(body.totalProduceLbs).toBe(3);
      expect(body.avgCostPerLb).toBe(16);

      expect(body.localSourcingPercentage).toBe(100);
    });
  });

  describe('GET /api/buyer/dashboard', () => {
    it('GET /api/buyer/dashboard should return 401 if unauthorized', async () => {
      const res = await authedRequest(`/api/buyer/dashboard`, { method: 'GET' }, { id: '' });
      expect(res.status).toBe(401);
    });

    it('GET /api/buyer/dashboard should return aggregated metrics for the buyer', async () => {
      const res = await authedRequest(`/api/buyer/dashboard`, { method: 'GET' }, { id: BUYER_ID });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;

      // Assert Volume (Order 2 + Order 3 = 32oz + 16oz = 48oz = 3 lbs this week)
      expect(body.onOrderThisWeekLbs).toBe(3);
      // 0 lbs last week -> 3 lbs this week is flagged as a 100% jump
      expect(body.percentChangeFromLastWeek).toBe(100);

      // Assert Spend (Order 2 + Order 3 = $32 + $16 = $48 this month)
      // Note: order 1 was 2 months ago, so last month's bucket remains $0
      expect(body.totalSpendThisMonth).toBe(48);
      expect(body.totalSpendLastMonth).toBe(0);

      expect(body.localGrowersSupplying).toBe(1); // Farm 1 is in same city / <50 mi

      // Farm 2 is ~77 miles away, Farm 1 is ~3.5 miles away
      expect(body.furthestGrowerDistanceMiles).toBeGreaterThan(70);
      expect(body.furthestGrowerDistanceMiles).toBeLessThan(85);

      expect(body.avgGrowerDistanceMiles).toBeGreaterThan(35);
      expect(body.avgGrowerDistanceMiles).toBeLessThan(45);

      expect(body.activeSubscriptions).toEqual([]);
    });
  });
});
