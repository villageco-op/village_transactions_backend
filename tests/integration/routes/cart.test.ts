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

  beforeAll(() => {
    testDb = getTestDb();
    cartRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([{ id: TEST_BUYER_ID, email: 'buyer.api@example.com' }]);
  });

  describe('POST /api/cart/add', () => {
    let product1Id: string;
    const SELLER_ID = 'seller_add_1';

    beforeEach(async () => {
      await testDb
        .insert(users)
        .values([{ id: SELLER_ID, name: 'Seller One', email: 's1@example.com' }]);

      const [dbProduce] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: SELLER_ID,
            title: 'Apples',
            pricePerOz: '0.20',
            totalOzInventory: '50',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      product1Id = dbProduce.id;
    });

    it('should return 200 and create a record in DB', async () => {
      const payload = {
        productId: product1Id,
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

      const [dbRes] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, body.reservationId));

      expect(dbRes).toBeDefined();
      expect(dbRes.buyerId).toBe(TEST_BUYER_ID);
      expect(dbRes.quantityOz).toBe('5.50');
    });

    it('should return 401 if not logged in', async () => {
      const res = await authedRequest(
        '/api/cart/add',
        {
          method: 'POST',
          body: JSON.stringify({ productId: product1Id, quantityOz: 1 }),
        },
        { id: '' },
      );
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid product UUID', async () => {
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
  });

  describe('GET /api/cart', () => {
    it('should return active cart grouped by seller', async () => {
      const S1_ID = 's1';
      const S2_ID = 's2';

      await testDb.insert(users).values([
        { id: S1_ID, name: 'Seller One', email: 's1@ex.com' },
        { id: S2_ID, name: 'Seller Two', email: 's2@ex.com' },
      ]);

      const [p1, p2] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: S1_ID,
            title: 'Apples',
            pricePerOz: '0.1',
            totalOzInventory: '10',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId: S2_ID,
            title: 'Bananas',
            pricePerOz: '0.1',
            totalOzInventory: '10',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      const now = new Date();
      const future = new Date(now.getTime() + 1000 * 60 * 15);
      const past = new Date(now.getTime() - 1000 * 60 * 5);

      await testDb.insert(cartReservations).values([
        { buyerId: TEST_BUYER_ID, productId: p1.id, quantityOz: '2', expiresAt: future },
        { buyerId: TEST_BUYER_ID, productId: p1.id, quantityOz: '4', expiresAt: past }, // Expired
        { buyerId: TEST_BUYER_ID, productId: p2.id, quantityOz: '3', expiresAt: future },
      ]);

      const res = await authedRequest('/api/cart', {}, { id: TEST_BUYER_ID });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.cart).toHaveLength(2);

      const s1Group = body.cart.find((g: any) => g.seller.id === S1_ID);
      expect(s1Group.items).toHaveLength(1);
      expect(s1Group.items[0].title).toBe('Apples');
    });

    it('should return 401 if not logged in', async () => {
      const res = await authedRequest('/api/cart', {}, { id: '' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/cart/remove/:reservationId', () => {
    it('should return 200 success regardless of record existence', async () => {
      const res = await authedRequest(
        '/api/cart/remove/res_123',
        { method: 'DELETE' },
        { id: TEST_BUYER_ID },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });
  });
});
