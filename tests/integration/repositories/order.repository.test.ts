import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import {
  users,
  produce,
  cartReservations,
  orderItems,
  subscriptions,
  orders,
} from '../../../src/db/schema.js';

describe('OrderRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    orderRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  it('should fulfill checkout session, deduct inventory, and create order records atomically', async () => {
    const buyerId = 'buyer_repo_test';
    const sellerId = 'seller_repo_test';

    await testDb.insert(users).values([
      { id: buyerId, email: 'buyer@test.com' },
      { id: sellerId, email: 'seller@test.com' },
    ]);

    const [testProduce] = await testDb
      .insert(produce)
      .values({
        sellerId,
        title: 'Test Carrots',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 14,
        seasonStart: '2025-01-01',
        seasonEnd: '2025-12-31',
        isSubscribable: true,
      })
      .returning();

    const [testReservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId,
        productId: testProduce.id,
        quantityOz: '25.5',
        isSubscription: true,
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      })
      .returning();

    const scheduledTime = new Date('2026-06-01T10:00:00Z');

    const newOrder = await orderRepository.fulfillCheckoutSession({
      buyerId,
      sellerId,
      stripeSessionId: 'cs_test_repo_123',
      stripeSubscriptionId: 'sub_test_repo_123',
      totalAmount: 12.75,
      fulfillmentType: 'pickup',
      scheduledTime,
      reservationIds: [testReservation.id],
    });

    expect(newOrder).toBeDefined();
    expect(newOrder.stripeSessionId).toBe('cs_test_repo_123');
    expect(newOrder.totalAmount).toBe('12.75');

    const items = await testDb.select().from(orderItems).where(eq(orderItems.orderId, newOrder.id));
    expect(items).toHaveLength(1);
    expect(items[0].quantityOz).toBe('25.50');
    expect(items[0].pricePerOz).toBe('0.50');

    const subs = await testDb
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.buyerId, buyerId));
    expect(subs).toHaveLength(1);
    expect(subs[0].productId).toBe(testProduce.id);
    expect(subs[0].quantityOz).toBe('25.50');
    expect(subs[0].stripeSubscriptionId).toBe('sub_test_repo_123');

    const [updatedProduce] = await testDb
      .select()
      .from(produce)
      .where(eq(produce.id, testProduce.id));
    expect(updatedProduce.totalOzInventory).toBe('74.50');

    const reservations = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, testReservation.id));
    expect(reservations).toHaveLength(0);
  });

  it('should throw an error and rollback if reservations are not found/expired', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const promise = orderRepository.fulfillCheckoutSession({
      buyerId: 'b1',
      sellerId: 's1',
      stripeSessionId: 'cs_test_missing',
      totalAmount: 10,
      fulfillmentType: 'pickup',
      scheduledTime: new Date(),
      reservationIds: [nonExistentId],
    });

    await expect(promise).rejects.toThrow('Reservations expired or not found.');
  });

  it('should throw an error if the reservation exists but the expiresAt date has passed', async () => {
    const buyerId = 'buyer-123';
    const sellerId = 'seller-123';

    await testDb.insert(users).values([
      { id: buyerId, email: 'buyer_expired@test.com' },
      { id: sellerId, email: 'seller_expired@test.com' },
    ]);

    const [testProduct] = await testDb
      .insert(produce)
      .values({
        sellerId: sellerId,
        title: 'Test Kale',
        pricePerOz: '1.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: '2025-01-01',
        seasonEnd: '2025-12-31',
      })
      .returning();

    const expiredDate = new Date();
    expiredDate.setHours(expiredDate.getHours() - 1);

    const [expiredReservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: buyerId,
        productId: testProduct.id,
        quantityOz: '10',
        expiresAt: expiredDate,
      })
      .returning();

    const promise = orderRepository.fulfillCheckoutSession({
      buyerId: buyerId,
      sellerId: sellerId,
      stripeSessionId: 'cs_expired_test',
      totalAmount: 15.0,
      fulfillmentType: 'pickup',
      scheduledTime: new Date(),
      reservationIds: [expiredReservation.id],
    });

    await expect(promise).rejects.toThrow('Reservations expired or not found.');

    const remaining = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, expiredReservation.id));
    expect(remaining.length).toBe(1);
  });

  describe('OrderRepository - Cancellation Integration', () => {
    it('should retrieve an order by its ID', async () => {
      const buyerId = 'b_fetch_test';
      const sellerId = 's_fetch_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'b_fetch@test.com' },
        { id: sellerId, email: 's_fetch@test.com' },
      ]);

      const [insertedOrder] = await testDb
        .insert(orders)
        .values({
          buyerId,
          sellerId,
          status: 'pending',
          totalAmount: '10.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        })
        .returning();

      const fetchedOrder = await orderRepository.getOrderById(insertedOrder.id);
      expect(fetchedOrder).toBeDefined();
      expect(fetchedOrder?.id).toBe(insertedOrder.id);
      expect(fetchedOrder?.totalAmount).toBe('10.00');
    });

    it('should return null when getting an order by a non-existent ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const fetchedOrder = await orderRepository.getOrderById(nonExistentId);
      expect(fetchedOrder).toBeNull();
    });

    it('should update an order to canceled and restock inventory safely', async () => {
      const buyerId = 'b_cancel_test';
      const sellerId = 's_cancel_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'buyer_c@test.com' },
        { id: sellerId, email: 'seller_c@test.com' },
      ]);

      const [testProduce] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Apples',
          pricePerOz: '0.50',
          totalOzInventory: '50',
          harvestFrequencyDays: 5,
          seasonStart: '2025-01-01',
          seasonEnd: '2025-12-31',
        })
        .returning();

      const [order] = await testDb
        .insert(orders)
        .values({
          buyerId,
          sellerId,
          status: 'pending',
          totalAmount: '5.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        })
        .returning();

      await testDb.insert(orderItems).values({
        orderId: order.id,
        productId: testProduce.id,
        quantityOz: '10',
        pricePerOz: '0.50',
      });

      const canceledOrder = await orderRepository.updateOrderToCanceled(
        order.id,
        'No longer needed',
      );

      expect(canceledOrder.status).toBe('canceled');
      expect(canceledOrder.cancelReason).toBe('No longer needed');

      const [restockedProduce] = await testDb
        .select()
        .from(produce)
        .where(eq(produce.id, testProduce.id));
      expect(restockedProduce.totalOzInventory).toBe('60.00');
    });
  });
  describe('OrderRepository - Reschedule Order Integration', () => {
    it('should update an order scheduled time', async () => {
      const buyerId = 'b_sched_test';
      const sellerId = 's_sched_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'b_sched@test.com' },
        { id: sellerId, email: 's_sched@test.com' },
      ]);

      const [order] = await testDb
        .insert(orders)
        .values({
          buyerId,
          sellerId,
          status: 'pending',
          totalAmount: '12.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date('2025-01-01T10:00:00Z'),
          paymentMethod: 'card',
        })
        .returning();

      const newTime = new Date('2025-12-25T14:30:00Z');
      const updatedOrder = await orderRepository.updateOrderScheduleTime(order.id, newTime);

      expect(updatedOrder.scheduledTime.toISOString()).toBe(newTime.toISOString());
    });
  });

  describe('OrderRepository - getOrders Integration', () => {
    it('should retrieve a list of orders mapped correctly with items and counterparty', async () => {
      const buyerId = 'b_list_1';
      const sellerId = 's_list_1';

      await testDb.insert(users).values([
        { id: buyerId, name: 'List Buyer', email: 'blist@test.com' },
        { id: sellerId, name: 'List Seller', email: 'slist@test.com' },
      ]);

      const [testProduce] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Heirloom Tomatoes',
          pricePerOz: '2.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 7,
          seasonStart: '2025-01-01',
          seasonEnd: '2025-12-31',
        })
        .returning();

      const [order] = await testDb
        .insert(orders)
        .values({
          buyerId,
          sellerId,
          status: 'pending',
          totalAmount: '20.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        })
        .returning();

      await testDb.insert(orderItems).values({
        orderId: order.id,
        productId: testProduce.id,
        quantityOz: '10',
        pricePerOz: '2.00',
      });

      const buyerOrders = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
      });

      expect(buyerOrders).toHaveLength(1);
      expect(buyerOrders[0].id).toBe(order.id);
      expect(buyerOrders[0].counterparty?.id).toBe(sellerId);
      expect(buyerOrders[0].counterparty?.name).toBe('List Seller');
      expect(buyerOrders[0].items).toHaveLength(1);
      expect(buyerOrders[0].items[0].product.title).toBe('Heirloom Tomatoes');

      const sellerOrders = await orderRepository.getOrders({
        userId: sellerId,
        role: 'seller',
      });

      expect(sellerOrders).toHaveLength(1);
      expect(sellerOrders[0].id).toBe(order.id);
      expect(sellerOrders[0].counterparty?.id).toBe(buyerId);
      expect(sellerOrders[0].counterparty?.name).toBe('List Buyer');
    });

    it('should correctly filter orders by status', async () => {
      const buyerId = 'b_list_status';
      const sellerId = 's_list_status';

      await testDb.insert(users).values([
        { id: buyerId, email: 'bstat@test.com' },
        { id: sellerId, email: 'sstat@test.com' },
      ]);

      await testDb.insert(orders).values([
        {
          buyerId,
          sellerId,
          status: 'pending',
          totalAmount: '10.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        },
        {
          buyerId,
          sellerId,
          status: 'completed',
          totalAmount: '15.00',
          fulfillmentType: 'delivery',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        },
      ]);

      const pendingOrders = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        status: 'pending',
      });

      expect(pendingOrders).toHaveLength(1);
      expect(pendingOrders[0].status).toBe('pending');

      const completedOrders = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        status: 'completed',
      });

      expect(completedOrders).toHaveLength(1);
      expect(completedOrders[0].status).toBe('completed');
    });

    it('should correctly filter orders by timeframeDays', async () => {
      const buyerId = 'b_list_time';
      const sellerId = 's_list_time';

      await testDb.insert(users).values([
        { id: buyerId, email: 'btime@test.com' },
        { id: sellerId, email: 'stime@test.com' },
      ]);

      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(now.getDate() - 40);

      await testDb.insert(orders).values([
        {
          buyerId,
          sellerId,
          status: 'completed',
          totalAmount: '10.00',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          createdAt: now,
          paymentMethod: 'card',
        },
        {
          buyerId,
          sellerId,
          status: 'completed',
          totalAmount: '15.00',
          fulfillmentType: 'delivery',
          scheduledTime: oldDate,
          createdAt: oldDate,
          paymentMethod: 'card',
        },
      ]);

      const recentOrders = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        timeframeDays: 30,
      });

      expect(recentOrders).toHaveLength(1);
      expect(recentOrders[0].totalAmount).toBe('10.00');
    });
  });

  describe('OrderRepository - getPayoutHistory Integration', () => {
    it('should correctly fetch completed order items for the given timeframe', async () => {
      const sellerId = 'seller_payout_test';
      const buyerId = 'buyer_payout_test';

      await testDb.insert(users).values([
        { id: sellerId, name: 'Farmer John', email: 'john@farm.com' },
        { id: buyerId, name: 'Customer Bob', email: 'bob@city.com' },
      ]);

      const [produceItem] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Farm Fresh Milk',
          pricePerOz: '0.10',
          totalOzInventory: '1000',
          harvestFrequencyDays: 1,
          seasonStart: '2025-01-01',
          seasonEnd: '2025-12-31',
        })
        .returning();

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);

      const [oldOrder, recentOrder, pendingOrder] = await testDb
        .insert(orders)
        .values([
          {
            buyerId,
            sellerId,
            status: 'completed',
            totalAmount: '5.00',
            fulfillmentType: 'pickup',
            scheduledTime: oldDate,
            createdAt: oldDate,
            paymentMethod: 'card',
          },
          {
            buyerId,
            sellerId,
            status: 'completed',
            totalAmount: '5.00',
            fulfillmentType: 'pickup',
            scheduledTime: recentDate,
            createdAt: recentDate,
            paymentMethod: 'card',
          },
          {
            buyerId,
            sellerId,
            status: 'pending',
            totalAmount: '5.00',
            fulfillmentType: 'pickup',
            scheduledTime: recentDate,
            createdAt: recentDate,
            paymentMethod: 'card',
          },
        ])
        .returning();

      await testDb.insert(orderItems).values([
        { orderId: oldOrder.id, productId: produceItem.id, quantityOz: '50', pricePerOz: '0.10' },
        {
          orderId: recentOrder.id,
          productId: produceItem.id,
          quantityOz: '50',
          pricePerOz: '0.10',
        },
        {
          orderId: pendingOrder.id,
          productId: produceItem.id,
          quantityOz: '50',
          pricePerOz: '0.10',
        },
      ]);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const payoutHistory = await orderRepository.getPayoutHistory(sellerId, startDate);

      expect(payoutHistory).toHaveLength(1);
      expect(payoutHistory[0].buyerName).toBe('Customer Bob');
      expect(payoutHistory[0].productName).toBe('Farm Fresh Milk');
      expect(payoutHistory[0].quantityOz).toBe('50.00');
    });
  });

  describe('OrderRepository - getActiveBuyerCount Integration', () => {
    const SELLER_ID = 'active_seller_test';
    const BUYER_1 = 'active_buyer_1';
    const BUYER_2 = 'active_buyer_2';
    const BUYER_3 = 'active_buyer_3';

    beforeEach(async () => {
      await truncateTables(testDb);

      await testDb.insert(users).values([
        { id: SELLER_ID, email: 'active.seller@test.com' },
        { id: BUYER_1, email: 'active.b1@test.com' },
        { id: BUYER_2, email: 'active.b2@test.com' },
        { id: BUYER_3, email: 'active.b3@test.com' },
      ]);

      const now = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(now.getMonth() - 1);

      await testDb.insert(orders).values([
        {
          id: '11111111-1111-1111-1111-111111111111',
          buyerId: BUYER_1,
          sellerId: SELLER_ID,
          status: 'completed',
          totalAmount: '10.00',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          createdAt: now,
          paymentMethod: 'card',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          buyerId: BUYER_1,
          sellerId: SELLER_ID,
          status: 'completed',
          totalAmount: '15.00',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          createdAt: now,
          paymentMethod: 'card',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          buyerId: BUYER_2,
          sellerId: SELLER_ID,
          status: 'completed',
          totalAmount: '20.00',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          createdAt: now,
          paymentMethod: 'card',
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          buyerId: BUYER_3,
          sellerId: SELLER_ID,
          status: 'completed',
          totalAmount: '5.00',
          fulfillmentType: 'pickup',
          scheduledTime: lastMonth,
          createdAt: lastMonth,
          paymentMethod: 'card',
        },
      ]);
    });

    it('should count distinct buyers that placed an order since a specific date', async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const count = await orderRepository.getActiveBuyerCount(SELLER_ID, startOfMonth);

      // Should be 2 (Buyer 1 and Buyer 2). Buyer 3 ordered last month.
      // Buyer 1 should only be counted once despite having 2 orders.
      expect(count).toBe(2);
    });

    it('should return 0 if no buyers are found since the provided date', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const count = await orderRepository.getActiveBuyerCount(SELLER_ID, futureDate);

      expect(count).toBe(0);
    });
  });
});
