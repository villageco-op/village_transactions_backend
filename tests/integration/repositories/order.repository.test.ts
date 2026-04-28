import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
  cartGroups,
} from '../../../src/db/schema.js';

describe('OrderRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    orderRepository.setDb(testDb);
    vi.useFakeTimers();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    const mockDate = new Date('2024-05-15T12:00:00Z');
    vi.setSystemTime(mockDate);
    await truncateTables(testDb);
  });

  describe('fulfillCheckoutSession', () => {
    let produceId: string;
    const BUYER_ID = 'buyer_fulfill_repo';
    const SELLER_ID = 'seller_fulfill_repo';

    beforeEach(async () => {
      await testDb.insert(users).values([
        { id: BUYER_ID, email: 'buyer@test.com' },
        { id: SELLER_ID, email: 'seller@test.com' },
      ]);

      const [newProduce] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Organic Strawberries',
          pricePerOz: '0.75',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          seasonStart: '2026-01-01',
          seasonEnd: '2026-12-31',
        })
        .returning();
      produceId = newProduce.id;
    });

    it('should fulfill a one-time purchase, deduct inventory, and delete reservations', async () => {
      const [group] = await testDb
        .insert(cartGroups)
        .values({
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          isSubscription: false,
        })
        .returning();

      const [res] = await testDb
        .insert(cartReservations)
        .values({
          groupId: group.id,
          buyerId: BUYER_ID,
          productId: produceId,
          quantityOz: '20',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .returning();

      const order = await orderRepository.fulfillCheckoutSession({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'cs_one_time',
        stripeReceiptUrl: 'https://receipt.url',
        totalAmount: 15.0,
        fulfillmentType: 'pickup',
        scheduledTime: new Date('2026-06-01T10:00:00Z'),
        reservationIds: [res.id],
      });

      // Assertions
      expect(order.id).toBeDefined();
      expect(order.totalAmount).toBe('15.00');

      // Verify Inventory (100 - 20 = 80)
      const [p] = await testDb.select().from(produce).where(eq(produce.id, produceId));
      expect(p.totalOzInventory).toBe('80.00');

      // Verify Order Item
      const items = await testDb.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      expect(items).toHaveLength(1);
      expect(items[0].quantityOz).toBe('20.00');

      // Verify NO subscription was created
      const subs = await testDb
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.buyerId, BUYER_ID));
      expect(subs).toHaveLength(0);

      // Verify Reservation was cleaned up
      const remainingRes = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, res.id));
      expect(remainingRes).toHaveLength(0);
    });

    it('should create a subscription record if the associated group is isSubscription: true', async () => {
      const [group] = await testDb
        .insert(cartGroups)
        .values({
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          isSubscription: true,
          frequencyDays: 7,
        })
        .returning();

      const [res] = await testDb
        .insert(cartReservations)
        .values({
          groupId: group.id,
          buyerId: BUYER_ID,
          productId: produceId,
          quantityOz: '10',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .returning();

      const firstDelivery = new Date('2026-06-01T10:00:00Z');

      await orderRepository.fulfillCheckoutSession({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'cs_sub',
        stripeSubscriptionId: 'sub_12345',
        stripeReceiptUrl: 'https://receipt.url',
        totalAmount: 7.5,
        fulfillmentType: 'delivery',
        scheduledTime: firstDelivery,
        reservationIds: [res.id],
      });

      // Verify Subscription record creation
      const [sub] = await testDb
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.buyerId, BUYER_ID));
      expect(sub).toBeDefined();
      expect(sub.stripeSubscriptionId).toBe('sub_12345');
      expect(sub.quantityOz).toBe('10.00');

      // Verification of Next Delivery Date (scheduledTime + 7 days)
      const expectedNextDate = new Date(firstDelivery);
      expectedNextDate.setDate(expectedNextDate.getDate() + 7);
      expect(sub.nextDeliveryDate.toISOString()).toBe(expectedNextDate.toISOString());
    });

    it('should throw an error and rollback if reservations have expired', async () => {
      const [group] = await testDb
        .insert(cartGroups)
        .values({
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
        })
        .returning();

      const [expiredRes] = await testDb
        .insert(cartReservations)
        .values({
          groupId: group.id,
          buyerId: BUYER_ID,
          productId: produceId,
          quantityOz: '5',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        })
        .returning();

      const fulfillAttempt = orderRepository.fulfillCheckoutSession({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'fail',
        stripeReceiptUrl: 'fail',
        totalAmount: 3.75,
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        reservationIds: [expiredRes.id],
      });

      await expect(fulfillAttempt).rejects.toThrow('Reservations expired or not found.');

      // Verify Inventory was NOT deducted due to rollback
      const [p] = await testDb.select().from(produce).where(eq(produce.id, produceId));
      expect(p.totalOzInventory).toBe('100.00');
    });

    it('should throw an error if the reservation IDs are missing', async () => {
      const fulfillAttempt = orderRepository.fulfillCheckoutSession({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'fail',
        stripeReceiptUrl: 'fail',
        totalAmount: 10,
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        reservationIds: [],
      });

      await expect(fulfillAttempt).rejects.toThrow('Reservations expired or not found.');
    });
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

      const { items: buyerOrders, total: buyerTotal } = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        limit: 10,
        offset: 0,
      });

      expect(buyerTotal).toBe(1);
      expect(buyerOrders).toHaveLength(1);
      expect(buyerOrders[0].id).toBe(order.id);
      expect(buyerOrders[0].counterparty?.id).toBe(sellerId);
      expect(buyerOrders[0].counterparty?.name).toBe('List Seller');
      expect(buyerOrders[0].items).toHaveLength(1);
      expect(buyerOrders[0].items[0].product.title).toBe('Heirloom Tomatoes');

      const { items: sellerOrders, total: sellerTotal } = await orderRepository.getOrders({
        userId: sellerId,
        role: 'seller',
        limit: 10,
        offset: 0,
      });

      expect(sellerTotal).toBe(1);
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

      const { items: pendingOrders, total: pendingTotal } = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        status: 'pending',
        limit: 10,
        offset: 0,
      });

      expect(pendingTotal).toBe(1);
      expect(pendingOrders).toHaveLength(1);
      expect(pendingOrders[0].status).toBe('pending');

      const { items: completedOrders, total: completedTotal } = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        status: 'completed',
        limit: 10,
        offset: 0,
      });

      expect(completedTotal).toBe(1);
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

      const { items: recentOrders, total: recentTotal } = await orderRepository.getOrders({
        userId: buyerId,
        role: 'buyer',
        timeframeDays: 30,
        limit: 10,
        offset: 0,
      });

      expect(recentTotal).toBe(1);
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

      const { items: payoutHistory, total } = await orderRepository.getPayoutHistory(
        sellerId,
        startDate,
        10,
        0,
      );

      expect(total).toBe(1);
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

  describe('OrderRepository - getAnalyticsForProducts Integration', () => {
    it('should successfully fetch order items joined with their order statuses for a list of products', async () => {
      const sellerId = 'seller_analytics';
      const buyerId = 'buyer_analytics';

      await testDb.insert(users).values([
        { id: sellerId, name: 'Farmer Dan', email: 'dan@farm.com' },
        { id: buyerId, name: 'Customer Sue', email: 'sue@city.com' },
      ]);

      const [product1, product2] = await testDb
        .insert(produce)
        .values([
          {
            sellerId,
            title: 'Corn',
            pricePerOz: '0.20',
            totalOzInventory: '100',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId,
            title: 'Peas',
            pricePerOz: '0.30',
            totalOzInventory: '100',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId,
            title: 'Carrots',
            pricePerOz: '0.40',
            totalOzInventory: '100',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      const [order1, order2] = await testDb
        .insert(orders)
        .values([
          {
            buyerId,
            sellerId,
            status: 'completed',
            totalAmount: '10',
            fulfillmentType: 'pickup',
            scheduledTime: new Date(),
            paymentMethod: 'card',
          },
          {
            buyerId,
            sellerId,
            status: 'pending',
            totalAmount: '15',
            fulfillmentType: 'pickup',
            scheduledTime: new Date(),
            paymentMethod: 'card',
          },
        ])
        .returning();

      await testDb.insert(orderItems).values([
        { orderId: order1.id, productId: product1.id, quantityOz: '20', pricePerOz: '0.20' },
        { orderId: order2.id, productId: product1.id, quantityOz: '15', pricePerOz: '0.20' },
        { orderId: order2.id, productId: product2.id, quantityOz: '10', pricePerOz: '0.30' },
      ]);

      // Query only products 1 & 2
      const results = await orderRepository.getAnalyticsForProducts([product1.id, product2.id]);

      expect(results).toHaveLength(3);

      const cornResults = results.filter((r) => r.productId === product1.id);
      expect(cornResults).toHaveLength(2);
      expect(cornResults.map((r) => r.status).sort()).toEqual(['completed', 'pending']);

      const peaResults = results.filter((r) => r.productId === product2.id);
      expect(peaResults).toHaveLength(1);
      expect(peaResults[0].status).toBe('pending');
    });

    it('should return an empty array if given an empty product list', async () => {
      const results = await orderRepository.getAnalyticsForProducts([]);
      expect(results).toEqual([]);
    });
  });

  describe('OrderRepository - getOrderWithItemsById', () => {
    it('should retrieve an order and its joined items', async () => {
      const buyerId = 'b_items_test';
      const sellerId = 's_items_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'b_items@test.com' },
        { id: sellerId, email: 's_items@test.com' },
      ]);

      const [testProduct] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Test Apples',
          pricePerOz: '1.00',
          totalOzInventory: '100',
          harvestFrequencyDays: 1,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const [insertedOrder] = await testDb
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
        orderId: insertedOrder.id,
        productId: testProduct.id,
        quantityOz: '20',
        pricePerOz: '1.00',
      });

      const fetchedOrderData = await orderRepository.getOrderWithItemsById(insertedOrder.id);

      expect(fetchedOrderData).toBeDefined();
      expect(fetchedOrderData?.id).toBe(insertedOrder.id);
      expect(fetchedOrderData?.items).toHaveLength(1);
      expect(fetchedOrderData?.items[0].productName).toBe('Test Apples');
      expect(fetchedOrderData?.items[0].quantityOz).toBe('20.00');
    });

    it('should return null when getting order items by a non-existent ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const fetchedOrder = await orderRepository.getOrderWithItemsById(nonExistentId);
      expect(fetchedOrder).toBeNull();
    });
  });

  describe('OrderRepository - getPendingOrdersByProductId', () => {
    it('should retrieve order IDs that are not canceled, refund_pending, or completed', async () => {
      const buyerId = 'b_pending_test';
      const sellerId = 's_pending_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'pending_buyer@test.com' },
        { id: sellerId, email: 'pending_seller@test.com' },
      ]);

      const [product] = await testDb
        .insert(produce)
        .values({
          sellerId,
          title: 'Test Spinach',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const validOrders = [
        { id: crypto.randomUUID(), status: 'paid' },
        { id: crypto.randomUUID(), status: 'pending' },
      ];
      const excludedOrders = [
        { id: crypto.randomUUID(), status: 'canceled' },
        { id: crypto.randomUUID(), status: 'completed' },
        { id: crypto.randomUUID(), status: 'refund_pending' },
      ];

      const allTestOrders = [...validOrders, ...excludedOrders];

      for (const item of allTestOrders) {
        await testDb.insert(orders).values({
          id: item.id,
          buyerId,
          sellerId,
          status: item.status,
          totalAmount: '10.00',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          paymentMethod: 'card',
        });

        await testDb.insert(orderItems).values({
          orderId: item.id,
          productId: product.id,
          quantityOz: '10',
          pricePerOz: '1.00',
        });
      }

      const pendingIds = await orderRepository.getPendingOrdersByProductId(product.id);

      expect(pendingIds).toContain(validOrders[0].id);
      expect(pendingIds).toContain(validOrders[1].id);

      expect(pendingIds).not.toContain(excludedOrders[0].id);
      expect(pendingIds).not.toContain(excludedOrders[1].id);
      expect(pendingIds).not.toContain(excludedOrders[2].id);

      expect(pendingIds).toHaveLength(2);
    });

    it('should return an empty array if no orders exist for the product', async () => {
      const emptyProductId = crypto.randomUUID();
      const results = await orderRepository.getPendingOrdersByProductId(emptyProductId);
      expect(results).toEqual([]);
    });
  });

  describe('OrderRepository - fulfillRecurringSubscription', () => {
    it('should create a new order, deduct inventory, and advance subscription date', async () => {
      const buyerId = 'b_sub_test';
      const sellerId = 's_sub_test';
      const productId = crypto.randomUUID();
      const subId = crypto.randomUUID();
      const stripeSubId = 'sub_12345';
      const stripeInvoiceId = 'in_99999';

      await testDb.insert(users).values([
        { id: buyerId, email: 'sub_buyer@test.com' },
        { id: sellerId, email: 'sub_seller@test.com' },
      ]);

      await testDb.insert(produce).values({
        id: productId,
        sellerId,
        title: 'Subscription Greens',
        pricePerOz: '2.00',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
      });

      const initialNextDelivery = new Date('2024-05-20T10:00:00Z');
      await testDb.insert(subscriptions).values({
        id: subId,
        buyerId,
        productId,
        stripeSubscriptionId: stripeSubId,
        quantityOz: '10',
        fulfillmentType: 'delivery',
        nextDeliveryDate: initialNextDelivery,
      });

      const result = await orderRepository.fulfillRecurringSubscription({
        stripeSubscriptionId: stripeSubId,
        stripeInvoiceId,
        stripeReceiptUrl: 'https://stripe.com/receipt',
        totalAmount: 20.0,
      });

      // Verify New Order
      expect(result.status).toBe('paid');
      expect(result.stripeInvoiceId).toBe(stripeInvoiceId);
      expect(result.totalAmount).toBe('20.00');

      // Verify Inventory Deduction
      const [updatedProduct] = await testDb.select().from(produce).where(eq(produce.id, productId));
      expect(updatedProduct.totalOzInventory).toBe('90.00');

      // Verify Subscription date advanced by 7 days
      const [updatedSub] = await testDb
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subId));
      const expectedDate = new Date(initialNextDelivery);
      expectedDate.setDate(expectedDate.getDate() + 7);
      expect(updatedSub.nextDeliveryDate.toISOString()).toBe(expectedDate.toISOString());
    });

    it('should be idempotent and return existing order if invoice ID is already processed', async () => {
      const buyerId = 'buyer_idempotent';
      const sellerId = 'seller_idempotent';
      const invoiceId = 'in_idempotent_test';

      await testDb.insert(users).values([
        { id: buyerId, email: 'idemp_b@test.com' },
        { id: sellerId, email: 'idemp_s@test.com' },
      ]);

      await testDb.insert(orders).values({
        id: crypto.randomUUID(),
        buyerId,
        sellerId,
        stripeInvoiceId: invoiceId,
        status: 'paid',
        totalAmount: '10.00',
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        paymentMethod: 'card',
      });

      const result = await orderRepository.fulfillRecurringSubscription({
        stripeSubscriptionId: 'any_sub_id', // Won't be looked up because existing check triggers first
        stripeInvoiceId: invoiceId,
        stripeReceiptUrl: 'url',
        totalAmount: 10,
      });

      expect(result.stripeInvoiceId).toBe(invoiceId);

      const allOrders = await testDb
        .select()
        .from(orders)
        .where(eq(orders.stripeInvoiceId, invoiceId));

      expect(allOrders).toHaveLength(1);
    });
  });

  describe('OrderRepository - autoCompletePassedOrders', () => {
    it('should mark "paid" orders as "completed" if they passed the 24-hour buffer', async () => {
      const buyerId = 'b_janitor';
      const sellerId = 's_janitor';
      await testDb.insert(users).values([
        { id: buyerId, email: 'j_b@test.com' },
        { id: sellerId, email: 'j_s@test.com' },
      ]);

      const now = new Date('2024-05-15T12:00:00Z');
      vi.setSystemTime(now);

      const oldTime = new Date(now);
      oldTime.setHours(oldTime.getHours() - 25); // 25 hours ago (Eligible)

      const recentTime = new Date(now);
      recentTime.setHours(recentTime.getHours() - 23); // 23 hours ago (Ineligible)

      const eligibleId = crypto.randomUUID();
      const ineligibleId = crypto.randomUUID();
      const wrongStatusId = crypto.randomUUID();

      await testDb.insert(orders).values([
        {
          id: eligibleId,
          buyerId,
          sellerId,
          status: 'paid',
          scheduledTime: oldTime,
          totalAmount: '10',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
        },
        {
          id: ineligibleId,
          buyerId,
          sellerId,
          status: 'paid',
          scheduledTime: recentTime,
          totalAmount: '10',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
        },
        {
          id: wrongStatusId,
          buyerId,
          sellerId,
          status: 'pending', // Not 'paid', so should be ignored even if old
          scheduledTime: oldTime,
          totalAmount: '10',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
        },
      ]);

      const completedOrders = await orderRepository.autoCompletePassedOrders();

      expect(completedOrders).toHaveLength(1);
      expect(completedOrders[0].id).toBe(eligibleId);
      expect(completedOrders[0].status).toBe('completed');

      const [stillPaid] = await testDb.select().from(orders).where(eq(orders.id, ineligibleId));
      expect(stillPaid.status).toBe('paid');

      const [stillPending] = await testDb.select().from(orders).where(eq(orders.id, wrongStatusId));
      expect(stillPending.status).toBe('pending');
    });
  });
});
