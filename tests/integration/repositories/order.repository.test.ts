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
});
