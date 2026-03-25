import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { users, produce, orders, orderItems } from '../../../src/db/schema.js';

describe('Buyer API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_integration_test';
  const SELLER_1_ID = 'seller_1_test';
  const SELLER_2_ID = 'seller_2_test';

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
        email: 'buyer@example.com',
        name: 'Hungry Buyer',
        address: '123 House Ave, Ruraltown, CA 90000',
      },
      {
        id: SELLER_1_ID,
        email: 'seller1@example.com',
        name: 'Farm One',
        address: '456 Dirt Rd, Ruraltown, CA 90000',
      },
      {
        id: SELLER_2_ID,
        email: 'seller2@example.com',
        name: 'Farm Two',
        address: '789 Apple Ave, Faraway, CA 90001',
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

  it('GET /api/buyer/growers should return 401 if unauthorized', async () => {
    const res = await authedRequest(`/api/buyer/growers`, { method: 'GET' }, { id: '' });
    expect(res.status).toBe(401);
  });

  it('GET /api/buyer/growers should return aggregated list of sellers bought from', async () => {
    const res = await authedRequest(`/api/buyer/growers`, { method: 'GET' }, { id: BUYER_ID });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Seller 2 should be omitted because their order is 'pending'
    expect(body).toHaveLength(1);

    const seller1Stats = body[0];

    expect(seller1Stats.sellerId).toBe(SELLER_1_ID);
    expect(seller1Stats.name).toBe('Farm One');
    expect(seller1Stats.address).toBe('456 Dirt Rd, Ruraltown, CA 90000');

    expect(seller1Stats.produceTypesOrdered.sort()).toEqual(['carrots', 'spinach'].sort());

    expect(seller1Stats.amountOrderedThisMonthLbs).toBe(2);

    expect(seller1Stats.daysSinceFirstOrder).toBeGreaterThanOrEqual(57); // Roughly two months
    expect(new Date(seller1Stats.firstOrderDate).getTime()).toBeLessThan(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );
  });

  it('GET /api/buyer/billing-summary should return aggregated financial stats', async () => {
    const res = await authedRequest(
      `/api/buyer/billing-summary`,
      { method: 'GET' },
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalSpent).toBe(48);
    expect(body.totalProduceLbs).toBe(3);
    expect(body.avgCostPerLb).toBe(16);

    expect(body.localSourcingPercentage).toBe(100);
  });
});
