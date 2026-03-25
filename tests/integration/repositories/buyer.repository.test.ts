import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

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
      { id: BUYER_ID, email: 'buyer.repo@example.com', name: 'Test Buyer' },
      {
        id: SELLER_1_ID,
        email: 'seller1.repo@example.com',
        name: 'Test Seller One',
        address: '111 One St',
      },
      {
        id: SELLER_2_ID,
        email: 'seller2.repo@example.com',
        name: 'Test Seller Two',
        address: '222 Two St',
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

  it('should accurately aggregate growers stats, filtering only completed orders', async () => {
    const results = await buyerRepository.getGrowersByBuyerId(BUYER_ID, 20, 0);

    expect(results).toHaveLength(2);

    const seller1 = results.find((r) => r.sellerId === SELLER_1_ID);
    const seller2 = results.find((r) => r.sellerId === SELLER_2_ID);

    expect(seller1).toBeDefined();
    expect(seller2).toBeDefined();

    expect(seller1!.name).toBe('Test Seller One');
    expect(seller1!.address).toBe('111 One St');

    expect(seller1!.produceTypesOrdered).toBeDefined();
    const s1Produce = seller1!.produceTypesOrdered!.sort();
    expect(s1Produce).toEqual(['carrots', 'spinach']);

    expect(Number(seller1!.amountThisMonthOz)).toBe(20);

    const timeDiffS1 = Date.now() - new Date(seller1!.firstOrderDate).getTime();
    expect(timeDiffS1).toBeGreaterThan(30 * 24 * 60 * 60 * 1000); // More than 30 days ago

    expect(Number(seller2!.amountThisMonthOz)).toBe(15);

    expect(seller2!.produceTypesOrdered).toEqual(['apples']);
  });

  it('should handle pagination limits and offsets', async () => {
    const limitResults = await buyerRepository.getGrowersByBuyerId(BUYER_ID, 1, 0);
    expect(limitResults).toHaveLength(1);

    const offsetResults = await buyerRepository.getGrowersByBuyerId(BUYER_ID, 1, 1);
    expect(offsetResults).toHaveLength(1);

    expect(limitResults[0].sellerId).not.toBe(offsetResults[0].sellerId);
  });

  it('should return an empty array for a buyer with no completed orders', async () => {
    const OTHER_BUYER_ID = 'empty_buyer_123';
    await testDb.insert(users).values({ id: OTHER_BUYER_ID, email: 'empty@example.com' });

    const results = await buyerRepository.getGrowersByBuyerId(OTHER_BUYER_ID, 20, 0);

    expect(results).toHaveLength(0);
  });
});
