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
    await testDb
      .insert(users)
      .values([{ id: TEST_BUYER_ID, email: 'buyer.api@example.com', lat: 40.0, lng: -73.0 }]);
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
            maxOrderQuantityOz: '20',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      product1Id = dbProduce.id;
    });

    it('should return 200 and create a record in DB', async () => {
      const res = await authedRequest(
        '/api/cart/add',
        {
          method: 'POST',
          body: JSON.stringify({ productId: product1Id, quantityOz: 5.5, isSubscription: false }),
        },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const [dbRes] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, body.entityId));
      expect(dbRes).toBeDefined();
      expect(dbRes.buyerId).toBe(TEST_BUYER_ID);
      expect(dbRes.quantityOz).toBe('5.50');
    });

    it('should return 401 if not logged in', async () => {
      const res = await authedRequest(
        '/api/cart/add',
        { method: 'POST', body: JSON.stringify({ productId: product1Id, quantityOz: 1 }) },
        { id: '' },
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/cart', () => {
    it('should return active cart grouped by seller AND checkout type (subscription vs non)', async () => {
      const S1_ID = 's1';
      const S2_ID = 's2';

      await testDb.insert(users).values([
        { id: S1_ID, name: 'Seller One', email: 's1@ex.com', lat: 40.0, lng: -73.0 },
        { id: S2_ID, name: 'Seller Two', email: 's2@ex.com', lat: 40.5, lng: -73.0 },
      ]);

      const [p1, p2, p3] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: S1_ID,
            title: 'Apples',
            pricePerOz: '0.1',
            totalOzInventory: '100',
            maxOrderQuantityOz: '10', // Testing limit
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
          {
            sellerId: S1_ID,
            title: 'Pears',
            pricePerOz: '0.1',
            totalOzInventory: '10',
            harvestFrequencyDays: 7,
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
        // Seller 1: One-time purchase
        {
          buyerId: TEST_BUYER_ID,
          productId: p1.id,
          quantityOz: '2',
          isSubscription: false,
          expiresAt: future,
        },
        // Seller 1: Subscription purchase
        {
          buyerId: TEST_BUYER_ID,
          productId: p2.id,
          quantityOz: '4',
          isSubscription: true,
          expiresAt: future,
        },
        // Expired purchase
        {
          buyerId: TEST_BUYER_ID,
          productId: p2.id,
          quantityOz: '4',
          isSubscription: false,
          expiresAt: past,
        },
        // Seller 2: One-time purchase
        {
          buyerId: TEST_BUYER_ID,
          productId: p3.id,
          quantityOz: '3',
          isSubscription: false,
          expiresAt: future,
        },
      ]);

      const res = await authedRequest('/api/cart', {}, { id: TEST_BUYER_ID });
      const body = await res.json();

      expect(res.status).toBe(200);

      // We expect 3 distinct checkout groups: S1_onetime, S1_sub, S2_onetime
      expect(body.data).toHaveLength(3);

      const s1OnetimeGroup = body.data.find((g: any) => g.groupId === `${S1_ID}-onetime`);
      expect(s1OnetimeGroup).toBeDefined();
      expect(s1OnetimeGroup.isSubscription).toBe(false);
      expect(s1OnetimeGroup.deliveryFee).toBeDefined();
      expect(s1OnetimeGroup.items).toHaveLength(1);
      expect(s1OnetimeGroup.items[0].title).toBe('Apples');
      expect(s1OnetimeGroup.items[0].maxOrderQuantityOz).toBe('10.00'); // Validates math limits min(100, 10)

      const s1SubGroup = body.data.find((g: any) => g.groupId === `${S1_ID}-sub`);
      expect(s1SubGroup).toBeDefined();
      expect(s1SubGroup.isSubscription).toBe(true);
      expect(s1SubGroup.items).toHaveLength(1);
      expect(s1SubGroup.items[0].title).toBe('Pears');

      const s2OnetimeGroup = body.data.find((g: any) => g.groupId === `${S2_ID}-onetime`);
      expect(s2OnetimeGroup.items[0].title).toBe('Bananas');
    });

    it('should return 401 if not logged in', async () => {
      const res = await authedRequest('/api/cart', {}, { id: '' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/cart/remove/:id', () => {
    let testReservationId: string;

    beforeEach(async () => {
      const SELLER_ID = 'seller_del_1';
      await testDb
        .insert(users)
        .values([{ id: SELLER_ID, name: 'Seller', email: 'del@example.com' }]);

      const [p] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: SELLER_ID,
            title: 'Delete Item',
            pricePerOz: '0.20',
            totalOzInventory: '50',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      const [res] = await testDb
        .insert(cartReservations)
        .values({
          buyerId: TEST_BUYER_ID,
          productId: p.id,
          quantityOz: '2.0',
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        })
        .returning();

      testReservationId = res.id;
    });

    it('should return 200 and physically delete the reservation from the DB', async () => {
      const res = await authedRequest(
        `/api/cart/remove/${testReservationId}`,
        { method: 'DELETE' },
        { id: TEST_BUYER_ID },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      const dbRes = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, testReservationId));
      expect(dbRes).toHaveLength(0);
    });
  });

  describe('PATCH /api/cart/update/:id', () => {
    let testReservationId: string;

    beforeEach(async () => {
      const SELLER_ID = 'seller_update_1';
      await testDb
        .insert(users)
        .values([{ id: SELLER_ID, name: 'Update Seller', email: 'upd@example.com' }]);

      const [p] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: SELLER_ID,
            title: 'Update Item',
            pricePerOz: '0.50',
            totalOzInventory: '100',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      const [res] = await testDb
        .insert(cartReservations)
        .values({
          buyerId: TEST_BUYER_ID,
          productId: p.id,
          quantityOz: '2.0',
          isSubscription: false,
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        })
        .returning();

      testReservationId = res.id;
    });

    it('should return 200 and physically update the reservation in the DB', async () => {
      const payload = { quantityOz: 15, isSubscription: true };

      const res = await authedRequest(
        `/api/cart/update/${testReservationId}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      const [dbRes] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, testReservationId));
      expect(dbRes.quantityOz).toBe('15.00');
      expect(dbRes.isSubscription).toBe(true);
    });
  });
});
