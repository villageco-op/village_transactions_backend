import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  closeTestDbConnection,
  getTestDb,
  truncateTables,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations } from '../../../src/db/schema.js';

describe('Cart API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_BUYER_ID = 'api_buyer_123';
  let productId: string;

  beforeAll(() => {
    testDb = getTestDb();
    cartRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values({
      id: TEST_BUYER_ID,
      email: 'buyer.api@example.com',
    });

    const [dbProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: TEST_BUYER_ID,
        title: 'Apples',
        pricePerOz: '0.20',
        totalOzInventory: '50',
        harvestFrequencyDays: 1,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
      })
      .returning();

    productId = dbProduce.id;
  });

  it('POST /api/cart/add should return 200 and create a record in DB', async () => {
    const payload = {
      productId: productId,
      quantityOz: 5.5,
      isSubscription: false,
    };

    const res = await authedRequest(
      '/api/cart/add',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reservationId).toBeDefined();

    const [dbRes] = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, body.reservationId));

    expect(dbRes).toBeDefined();
    expect(dbRes.buyerId).toBe(TEST_BUYER_ID);
    expect(dbRes.quantityOz).toBe('5.50');
  });

  it('POST /api/cart/add should return 401 if not logged in', async () => {
    const res = await authedRequest(
      '/api/cart/add',
      {
        method: 'POST',
        body: JSON.stringify({ productId: productId, quantityOz: 1 }),
      },
      { id: '' }, // No ID
    );

    expect(res.status).toBe(401);
  });

  it('POST /api/cart/add should return 400 for invalid product UUID', async () => {
    const res = await authedRequest(
      '/api/cart/add',
      {
        method: 'POST',
        body: JSON.stringify({
          productId: 'not-a-uuid',
          quantityOz: 1,
          isSubscription: false,
        }),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(400);
  });

  it('GET /api/cart should return 200', async () => {
    const res = await authedRequest('/api/cart', {}, { id: TEST_BUYER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('DELETE /api/cart/remove/:reservationId should return 200', async () => {
    const res = await authedRequest(
      '/api/cart/remove/res_123',
      {
        method: 'DELETE',
      },
      { id: TEST_BUYER_ID },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
