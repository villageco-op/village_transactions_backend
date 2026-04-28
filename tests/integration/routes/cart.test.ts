import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  closeTestDbConnection,
  getTestDb,
  truncateTables,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations, cartGroups } from '../../../src/db/schema.js';
import { CartCheckoutGroup } from '../../../src/schemas/cart.schema.js';

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
    let productId: string;
    const SELLER_ID = 'seller_add_1';

    beforeEach(async () => {
      await testDb
        .insert(users)
        .values([{ id: SELLER_ID, name: 'Seller One', email: 's1@example.com' }]);
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Apples',
          pricePerOz: '0.20',
          totalOzInventory: '50',
          harvestFrequencyDays: 1,
          status: 'active',
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();
      productId = p.id;
    });

    it('should create a reservation and an associated cart group', async () => {
      const res = await authedRequest(
        '/api/cart/add',
        {
          method: 'POST',
          body: JSON.stringify({ productId, quantityOz: 5, isSubscription: false }),
        },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      const [dbRes] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, body.entityId));
      expect(dbRes.groupId).toBeDefined();

      const [dbGroup] = await testDb
        .select()
        .from(cartGroups)
        .where(eq(cartGroups.id, dbRes.groupId));
      expect(dbGroup.sellerId).toBe(SELLER_ID);
    });
  });

  describe('GET /api/cart', () => {
    it('should return grouped data reflecting the database cart_groups', async () => {
      const S1_ID = 's1';
      await testDb
        .insert(users)
        .values([{ id: S1_ID, name: 'Seller One', email: 's1@ex.com', lat: 40.0, lng: -73.0 }]);

      const [p1] = await testDb
        .insert(produce)
        .values({
          sellerId: S1_ID,
          title: 'Kale',
          pricePerOz: '0.5',
          totalOzInventory: '100',
          harvestFrequencyDays: 7,
          status: 'active',
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      // Create one subscription item and one one-time item (results in 2 groups)
      await cartRepository.addToCart(TEST_BUYER_ID, {
        productId: p1.id,
        quantityOz: 2,
        isSubscription: false,
      });
      await cartRepository.addToCart(TEST_BUYER_ID, {
        productId: p1.id,
        quantityOz: 5,
        isSubscription: true,
      });

      const res = await authedRequest('/api/cart', {}, { id: TEST_BUYER_ID });
      const body = await res.json();
      const groups: CartCheckoutGroup[] = body.data;

      expect(res.status).toBe(200);
      // Data should be an array of groups
      expect(groups).toHaveLength(2);

      const subGroup = groups.find((g) => g.isSubscription === true);
      expect(subGroup).toBeDefined();
      expect(subGroup?.items).toHaveLength(1);
      expect(subGroup?.items[0].quantityOz).toBe('5.00');
    });
  });

  describe('PATCH /api/cart/group/{id}', () => {
    it('should update the fulfillment type for an entire group', async () => {
      const SELLER_ID = 's_fulfillment';
      await testDb.insert(users).values([{ id: SELLER_ID, name: 'S1', email: 'f@ex.com' }]);
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Item',
          pricePerOz: '1',
          totalOzInventory: '10',
          status: 'active',
          harvestFrequencyDays: 7,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const reservation = await cartRepository.addToCart(TEST_BUYER_ID, {
        productId: p.id,
        quantityOz: 1,
        isSubscription: false,
      });

      const res = await authedRequest(
        `/api/cart/group/${reservation.groupId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ fulfillmentType: 'delivery' }),
        },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);

      const [updatedGroup] = await testDb
        .select()
        .from(cartGroups)
        .where(eq(cartGroups.id, reservation.groupId));
      expect(updatedGroup.fulfillmentType).toBe('delivery');
    });
  });

  describe('PATCH /api/cart/update/:id', () => {
    it('should handle group-hopping when subscription status is toggled via API', async () => {
      const SELLER_ID = 's_hop';
      await testDb.insert(users).values([{ id: SELLER_ID, name: 'S1', email: 'h@ex.com' }]);
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Item',
          pricePerOz: '1',
          totalOzInventory: '10',
          harvestFrequencyDays: 7,
          status: 'active',
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const initial = await cartRepository.addToCart(TEST_BUYER_ID, {
        productId: p.id,
        quantityOz: 1,
        isSubscription: false,
      });

      const res = await authedRequest(
        `/api/cart/update/${initial.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isSubscription: true }),
        },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);

      const [updatedRes] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, initial.id));
      expect(updatedRes.groupId).not.toBe(initial.groupId); // Verified group changed
    });
  });

  describe('DELETE /api/cart/remove/:id', () => {
    it('should remove the reservation and return 200', async () => {
      const SELLER_ID = 's_del';
      await testDb.insert(users).values([{ id: SELLER_ID, name: 'S1', email: 'd@ex.com' }]);
      const [p] = await testDb
        .insert(produce)
        .values({
          sellerId: SELLER_ID,
          title: 'Item',
          pricePerOz: '1',
          totalOzInventory: '10',
          status: 'active',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      const reservation = await cartRepository.addToCart(TEST_BUYER_ID, {
        productId: p.id,
        quantityOz: 1,
        isSubscription: false,
      });

      const res = await authedRequest(
        `/api/cart/remove/${reservation.id}`,
        { method: 'DELETE' },
        { id: TEST_BUYER_ID },
      );

      expect(res.status).toBe(200);
      const check = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, reservation.id));
      expect(check).toHaveLength(0);
    });
  });
});
