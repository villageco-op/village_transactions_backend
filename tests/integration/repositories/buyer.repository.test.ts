import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { users, produce, orders, orderItems } from '../../../src/db/schema.js';
import { sql } from 'drizzle-orm';

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
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`,
      },
      {
        id: SELLER_1_ID,
        name: 'Local Seller',
        city: 'Chicago',
        location: sql`ST_SetSRID(ST_MakePoint(-87.6231, 41.8819), 4326)`,
      },
      {
        id: SELLER_2_ID,
        name: 'Far Seller',
        city: 'Springfield',
        location: sql`ST_SetSRID(ST_MakePoint(-89.6501, 39.7817), 4326)`,
      },
    ]);

    const [produceSpinach, produceCarrots, produceApples] = await testDb
      .insert(produce)
      .values([
        {
          sellerId: SELLER_1_ID,
          title: 'Spinach',
          produceType: 'spinach',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_1_ID,
          title: 'Carrots',
          produceType: 'carrots',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        },
        {
          sellerId: SELLER_2_ID,
          title: 'Apples',
          produceType: 'apples',
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

  it('should accurately aggregate growers stats including city', async () => {
    const results = await buyerRepository.getGrowersByBuyerId(BUYER_ID, 20, 0);
    const seller1 = results.find((r) => r.sellerId === SELLER_1_ID);
    expect(seller1?.city).toBe('Chicago');
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
});
