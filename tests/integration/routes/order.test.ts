import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { users, orders } from '../../../src/db/schema.js';

import * as stripeService from '../../../src/services/stripe.service.js';
import * as notificationService from '../../../src/services/notification.service.js';

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
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
    vi.clearAllMocks();

    await testDb.insert(users).values([
      { id: BUYER_ID, email: 'buyer@test.com' },
      { id: SELLER_ID, email: 'seller@test.com' },
    ]);

    const [createdOrder] = await testDb
      .insert(orders)
      .values({
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        stripeSessionId: 'cs_integration_test',
        status: 'pending',
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        totalAmount: '10.00',
        paymentMethod: 'card',
      })
      .returning();

    testOrder = createdOrder;
  });

  it('GET /api/orders should return 200', async () => {
    const res = await authedRequest('/api/orders?role=buyer&status=pending', {}, { id: BUYER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /api/orders/:id/schedule should return 200', async () => {
    const res = await authedRequest(
      '/api/orders/order_123/schedule',
      {
        method: 'PUT',
        body: JSON.stringify({
          newTime: '2023-12-01T14:00:00Z',
        }),
      },
      { id: BUYER_ID },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
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
});
