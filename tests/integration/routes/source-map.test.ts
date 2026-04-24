import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { users, orders, orderItems, produce } from '../../../src/db/schema.js';
import { sourceMapRepository } from '../../../src/repositories/source-map.repository.js';

describe('Source Map API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'api_buyer_1';
  const SELLER_ID = 'api_seller_1';

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
      { id: BUYER_ID, name: 'API Buyer' },
      { id: SELLER_ID, name: 'API Seller', lat: 41.8, lng: -87.6 },
    ]);

    const [testProduce] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_ID,
          title: 'Api Corn',
          produceType: 'grains_pulses',
          pricePerOz: '0.10',
          totalOzInventory: '500',
          harvestFrequencyDays: 30,
          seasonStart: new Date('2024-05-01'),
          seasonEnd: new Date('2024-09-30'),
        },
      ])
      .returning();

    const [order] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: new Date(),
          totalAmount: '10.00',
          createdAt: new Date('2024-04-15T10:00:00Z'), // Spring
        },
      ])
      .returning();

    await testDb
      .insert(orderItems)
      .values([
        { orderId: order.id, productId: testProduce.id, quantityOz: '100', pricePerOz: '0.10' },
      ]);
  });

  describe('GET /api/source-map/nodes', () => {
    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await authedRequest(`/api/source-map/nodes`, { method: 'GET' }, { id: '' });
      expect(res.status).toBe(401);
    });

    it('should return 200 and an array of nodes for the authenticated buyer', async () => {
      const res = await authedRequest(`/api/source-map/nodes`, { method: 'GET' }, { id: BUYER_ID });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);

      const node = data[0];
      expect(node.sellerId).toBe(SELLER_ID);
      expect(node.totalVolumeOz).toBe(100);
      expect(node.primaryProduceType).toBe('grains_pulses');
      expect(node.produceCategories).toEqual(['grains_pulses']);
    });

    it('should accept the season query parameter filter', async () => {
      const resSpring = await authedRequest(
        `/api/source-map/nodes?season=spring`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resSpring.status).toBe(200);
      const dataSpring = await resSpring.json();
      expect(dataSpring).toHaveLength(1);

      const resFall = await authedRequest(
        `/api/source-map/nodes?season=fall`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resFall.status).toBe(200);
      const dataFall = await resFall.json();
      expect(dataFall).toHaveLength(0);
    });
  });

  describe('GET /api/source-map/analytics', () => {
    it('should return 401 Unauthorized if not authenticated', async () => {
      const res = await authedRequest(`/api/source-map/analytics`, { method: 'GET' }, { id: '' });
      expect(res.status).toBe(401);
    });

    it('should return 200 and formatted analytics data for the buyer', async () => {
      const res = await authedRequest(
        `/api/source-map/analytics`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('totalSpend', 10);
      expect(data).toHaveProperty('totalVolumeOz', 100);
      expect(data).toHaveProperty('uniqueGrowers', 1);
      expect(data).toHaveProperty('foodMilesSaved', 1480); // 1 order * 1480

      expect(data.produceBreakdown).toHaveLength(1);
      expect(data.produceBreakdown[0].produceType).toBe('grains_pulses');
      expect(data.produceBreakdown[0].percentage).toBe(100);
    });

    it('should accept the produceType query parameter filter', async () => {
      // Valid filter
      const resCorn = await authedRequest(
        `/api/source-map/analytics?produceType=grains_pulses`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resCorn.status).toBe(200);
      let data = await resCorn.json();
      expect(data.totalVolumeOz).toBe(100);

      // Filter with no results
      const resApples = await authedRequest(
        `/api/source-map/analytics?produceType=stone_fruits`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resApples.status).toBe(200);
      data = await resApples.json();
      expect(data.totalVolumeOz).toBe(0);
      expect(data.produceBreakdown).toHaveLength(0);
    });

    it('should accept the season query parameter filter', async () => {
      const resSpring = await authedRequest(
        `/api/source-map/analytics?season=spring`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resSpring.status).toBe(200);
      let data = await resSpring.json();
      expect(data.totalVolumeOz).toBe(100);

      const resFall = await authedRequest(
        `/api/source-map/analytics?season=fall`,
        { method: 'GET' },
        { id: BUYER_ID },
      );
      expect(resFall.status).toBe(200);
      data = await resFall.json();
      expect(data.totalVolumeOz).toBe(0);
      expect(data.produceBreakdown).toHaveLength(0);
    });
  });
});
