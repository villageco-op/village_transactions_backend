import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations, cartGroups } from '../../../src/db/schema.js';

describe('CartRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_repo_123';
  const SELLER_ID = 'seller_repo_123';
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

    await testDb.insert(users).values([
      { id: BUYER_ID, email: 'buyer@test.com', name: 'Test Buyer', lat: 40.7128, lng: -74.006 },
      { id: SELLER_ID, email: 'seller@test.com', name: 'Test Seller', lat: 40.7306, lng: -73.9352 },
    ]);

    const [newProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Test Kale',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        status: 'active',
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
      })
      .returning();

    productId = newProduce.id;
  });

  describe('addToCart', () => {
    it('should create a cart group and a reservation simultaneously', async () => {
      const payload = { productId, quantityOz: 10, isSubscription: false };

      const reservation = await cartRepository.addToCart(BUYER_ID, payload);

      // Verify Reservation
      expect(reservation.groupId).toBeDefined();
      expect(reservation.quantityOz).toBe('10.00');

      // Verify Group was created automatically
      const [group] = await testDb
        .select()
        .from(cartGroups)
        .where(eq(cartGroups.id, reservation.groupId));
      expect(group.buyerId).toBe(BUYER_ID);
      expect(group.isSubscription).toBe(false);
      expect(group.fulfillmentType).toBe('pickup');
    });

    it('should reuse an existing group if parameters match', async () => {
      const payload = { productId, quantityOz: 5, isSubscription: false };

      const res1 = await cartRepository.addToCart(BUYER_ID, payload);
      const res2 = await cartRepository.addToCart(BUYER_ID, payload);

      expect(res1.groupId).toBe(res2.groupId);

      const groups = await testDb.select().from(cartGroups).where(eq(cartGroups.buyerId, BUYER_ID));
      expect(groups).toHaveLength(1);
    });
  });

  describe('getActiveCart', () => {
    it('should cleanup expired reservations AND orphaned groups', async () => {
      // Manually insert an expired reservation and its group
      const [group] = await testDb
        .insert(cartGroups)
        .values({
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
        })
        .returning();

      await testDb.insert(cartReservations).values({
        groupId: group.id,
        buyerId: BUYER_ID,
        productId,
        quantityOz: '10',
        expiresAt: new Date(Date.now() - 1000), // Expired
      });

      // Insert an active reservation
      await cartRepository.addToCart(BUYER_ID, { productId, quantityOz: 5, isSubscription: true });

      const activeCart = await cartRepository.getActiveCart(BUYER_ID);

      // Should only have the active one
      expect(activeCart).toHaveLength(1);
      expect(activeCart[0].group.isSubscription).toBe(true);

      // Verify DB cleanup
      const dbGroups = await testDb
        .select()
        .from(cartGroups)
        .where(eq(cartGroups.buyerId, BUYER_ID));
      const dbRes = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.buyerId, BUYER_ID));

      expect(dbGroups).toHaveLength(1); // Orphaned group should be deleted
      expect(dbRes).toHaveLength(1);
    });
  });

  describe('updateCartItem', () => {
    it('should move a reservation to a new group when isSubscription is toggled', async () => {
      // Start as one-time purchase
      const initial = await cartRepository.addToCart(BUYER_ID, {
        productId,
        quantityOz: 10,
        isSubscription: false,
      });
      const originalGroupId = initial.groupId;

      // Update to subscription
      const success = await cartRepository.updateCartItem(BUYER_ID, initial.id, {
        isSubscription: true,
      });
      expect(success).toBe(true);

      const [updated] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, initial.id));

      // Should have a new group ID
      expect(updated.groupId).not.toBe(originalGroupId);

      const [newGroup] = await testDb
        .select()
        .from(cartGroups)
        .where(eq(cartGroups.id, updated.groupId));
      expect(newGroup.isSubscription).toBe(true);
      expect(newGroup.frequencyDays).toBe(7); // Pulled from product harvestFrequencyDays
    });

    it('should update quantity without changing the group', async () => {
      const initial = await cartRepository.addToCart(BUYER_ID, {
        productId,
        quantityOz: 10,
        isSubscription: false,
      });

      await cartRepository.updateCartItem(BUYER_ID, initial.id, { quantityOz: 25 });

      const [updated] = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, initial.id));
      expect(updated.quantityOz).toBe('25.00');
      expect(updated.groupId).toBe(initial.groupId);
    });
  });

  describe('updateGroupFulfillment', () => {
    it('should update fulfillmentType for the entire group', async () => {
      const res = await cartRepository.addToCart(BUYER_ID, {
        productId,
        quantityOz: 10,
        isSubscription: false,
      });

      await cartRepository.updateGroupFulfillment(BUYER_ID, res.groupId, 'delivery');

      const [group] = await testDb.select().from(cartGroups).where(eq(cartGroups.id, res.groupId));
      expect(group.fulfillmentType).toBe('delivery');
    });
  });

  describe('removeFromCart', () => {
    it('should remove the reservation record', async () => {
      const res = await cartRepository.addToCart(BUYER_ID, {
        productId,
        quantityOz: 10,
        isSubscription: false,
      });

      const success = await cartRepository.removeFromCart(BUYER_ID, res.id);
      expect(success).toBe(true);

      const check = await testDb
        .select()
        .from(cartReservations)
        .where(eq(cartReservations.id, res.id));
      expect(check).toHaveLength(0);
    });
  });

  describe('releaseExpiredCarts', () => {
    it('should globally clear expired items regardless of buyer', async () => {
      const BUYER_2 = 'buyer_2';
      await testDb.insert(users).values({ id: BUYER_2, email: 'b2@test.com' });

      // Create expired items for two different buyers
      const g1 = await testDb
        .insert(cartGroups)
        .values({ buyerId: BUYER_ID, sellerId: SELLER_ID })
        .returning();
      const g2 = await testDb
        .insert(cartGroups)
        .values({ buyerId: BUYER_2, sellerId: SELLER_ID })
        .returning();

      await testDb.insert(cartReservations).values([
        {
          groupId: g1[0].id,
          buyerId: BUYER_ID,
          productId,
          quantityOz: '1',
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          groupId: g2[0].id,
          buyerId: BUYER_2,
          productId,
          quantityOz: '1',
          expiresAt: new Date(Date.now() - 1000),
        },
      ]);

      const count = await cartRepository.releaseExpiredCarts();
      expect(count).toBe(2);

      const remaining = await testDb.select().from(cartReservations);
      expect(remaining).toHaveLength(0);
    });
  });
});
