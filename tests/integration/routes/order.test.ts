import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { users, orders, orderItems, produce } from '../../../src/db/schema.js';

import * as stripeService from '../../../src/services/stripe.service.js';
import * as notificationService from '../../../src/services/notification.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';

vi.spyOn(stripeService, 'refundCheckoutSession').mockResolvedValue();
vi.spyOn(notificationService, 'sendPushNotification').mockResolvedValue();

describe('Order API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_integration_1';
  const SELLER_ID = 'seller_integration_1';
  let testOrder: any;

  beforeAll(() => {
    testDb = getTestDb();
    orderRepository.setDb(testDb);
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
    vi.clearAllMocks();

    await testDb.insert(users).values([
      { id: BUYER_ID, name: 'Test Buyer', email: 'buyer@test.com' },
      { id: SELLER_ID, name: 'Test Seller', email: 'seller@test.com' },
    ]);

    const [testProduct] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Fresh Berries',
        pricePerOz: '1.20',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: '2025-01-01',
        seasonEnd: '2025-12-31',
      })
      .returning();

    const [createdOrder] = await testDb
      .insert(orders)
      .values({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'cs_integration_test',
        status: 'pending',
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        totalAmount: '12.00',
        paymentMethod: 'card',
      })
      .returning();

    await testDb.insert(orderItems).values({
      orderId: createdOrder.id,
      productId: testProduct.id,
      quantityOz: '10',
      pricePerOz: '1.20',
    });

    testOrder = createdOrder;
  });

  it('GET /api/orders should return 200', async () => {
    const res = await authedRequest('/api/orders?role=buyer&status=pending', {}, { id: BUYER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('PUT /api/orders/:id/schedule should return 200 and trigger notification', async () => {
    const newTime = new Date('2025-12-01T14:00:00Z').toISOString();

    const res = await authedRequest(
      `/api/orders/${testOrder.id}/schedule`,
      {
        method: 'PUT',
        body: JSON.stringify({
          newTime,
        }),
      },
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(notificationService.sendPushNotification).toHaveBeenCalledWith(
      SELLER_ID,
      'Order Rescheduled 🕒',
      expect.stringContaining('buyer'),
    );
  });

  it('PUT /api/orders/:id/cancel should cancel the order successfully', async () => {
    const res = await authedRequest(
      `/api/orders/${testOrder.id}/cancel`,
      {
        method: 'PUT',
        body: JSON.stringify({ reason: 'Cannot make pickup time' }),
      },
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(stripeService.refundCheckoutSession).toHaveBeenCalledWith('cs_integration_test');
    expect(notificationService.sendPushNotification).toHaveBeenCalledWith(
      SELLER_ID,
      'Order Canceled ❌',
      'The buyer has canceled the order. Reason: Cannot make pickup time',
    );
  });

  describe('GET /api/orders', () => {
    it('should return successfully with correct structure for a buyer', async () => {
      const res = await authedRequest(
        '/api/orders?role=buyer&status=pending',
        {},
        { id: BUYER_ID },
      );
      expect(res.status).toBe(200);

      const { data, meta } = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(meta.total).toBe(1);

      const retrievedOrder = data[0];
      expect(retrievedOrder.id).toBe(testOrder.id);
      expect(retrievedOrder.totalAmount).toBe('12.00');

      expect(retrievedOrder.counterparty).toBeDefined();
      expect(retrievedOrder.counterparty.id).toBe(SELLER_ID);
      expect(retrievedOrder.counterparty.name).toBe('Test Seller');

      expect(retrievedOrder.items).toBeDefined();
      expect(Array.isArray(retrievedOrder.items)).toBe(true);
      expect(retrievedOrder.items).toHaveLength(1);
      expect(retrievedOrder.items[0].product.title).toBe('Fresh Berries');
    });

    it('should return successfully with correct structure for a seller', async () => {
      const res = await authedRequest('/api/orders?role=seller', {}, { id: SELLER_ID });
      expect(res.status).toBe(200);

      const { data, meta } = await res.json();
      expect(data).toHaveLength(1);
      expect(meta.total).toBe(1);

      const retrievedOrder = data[0];
      expect(retrievedOrder.id).toBe(testOrder.id);
      expect(retrievedOrder.counterparty.id).toBe(BUYER_ID);
      expect(retrievedOrder.counterparty.name).toBe('Test Buyer');
    });

    it('should return an empty array if status does not match', async () => {
      const res = await authedRequest(
        '/api/orders?role=buyer&status=completed',
        {},
        { id: BUYER_ID },
      );
      expect(res.status).toBe(200);

      const { data } = await res.json();
      expect(data).toHaveLength(0);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should return 200 and the correct comprehensive details for the buyer', async () => {
      const res = await authedRequest(
        `/api/orders/${testOrder.id}`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.id).toBe(testOrder.id);
      expect(body.totalAmount).toBe('12.00');
      expect(body.stripeSessionId).toBeUndefined(); // Ensure sensitive data is stripped

      // Validate Buyer Details
      expect(body.buyer).toBeDefined();
      expect(body.buyer.id).toBe(BUYER_ID);
      expect(body.buyer.name).toBe('Test Buyer');

      // Validate Seller Details
      expect(body.seller).toBeDefined();
      expect(body.seller.id).toBe(SELLER_ID);
      expect(body.seller.name).toBe('Test Seller');

      // Validate Items Joined Correctly
      expect(body.items).toHaveLength(1);
      expect(body.items[0].productName).toBe('Fresh Berries');
      expect(body.items[0].quantityOz).toBe('10.00');
    });

    it('should return 200 and details when requested by the seller', async () => {
      const res = await authedRequest(
        `/api/orders/${testOrder.id}`,
        { method: 'GET' },
        { id: SELLER_ID },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(testOrder.id);
    });

    it('should return 404 when requested by an unrelated user (unauthorized view)', async () => {
      const res = await authedRequest(
        `/api/orders/${testOrder.id}`,
        { method: 'GET' },
        { id: 'some_random_snooper_id' },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should return 404 for a malformed/non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await authedRequest(
        `/api/orders/${nonExistentId}`,
        { method: 'GET' },
        { id: BUYER_ID },
      );

      expect(res.status).toBe(404);
    });
  });
});
