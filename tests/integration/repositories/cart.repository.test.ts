import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations } from '../../../src/db/schema.js';

describe('CartRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'buyer_repo_123';
  const SELLER_ID = 'seller_repo_123';
  let product_id: string;

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
      { id: BUYER_ID, email: 'buyer@test.com', name: 'Test Buyer' },
      { id: SELLER_ID, email: 'seller@test.com', name: 'Test Seller' },
    ]);

    const [newProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: SELLER_ID,
        title: 'Test Kale',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 7,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
      })
      .returning();

    product_id = newProduce.id;
  });

  it('should create a cart reservation with 15 minute expiration', async () => {
    const payload = {
      productId: product_id,
      quantityOz: 10,
      isSubscription: true,
    };

    const reservation = await cartRepository.addToCart(BUYER_ID, payload);

    expect(reservation.id).toBeDefined();
    expect(reservation.buyerId).toBe(BUYER_ID);
    expect(reservation.quantityOz).toBe('10.00');
    expect(reservation.isSubscription).toBe(true);

    const now = new Date();
    const diffMins = (reservation.expiresAt.getTime() - now.getTime()) / (1000 * 60);
    expect(diffMins).toBeGreaterThan(14);
    expect(diffMins).toBeLessThan(16);
  });

  it('should drop expired reservations and fetch active ones joined with seller and product info', async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 1000 * 60 * 5);
    const futureDate = new Date(now.getTime() + 1000 * 60 * 15);

    await testDb.insert(cartReservations).values([
      {
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        expiresAt: pastDate,
      },
      {
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '10',
        expiresAt: futureDate,
      },
    ]);

    const activeItems = await cartRepository.getActiveCart(BUYER_ID);

    expect(activeItems).toHaveLength(1);

    const item = activeItems[0];
    expect(item.reservation.quantityOz).toBe('10.00');
    expect(item.product.title).toBe('Test Kale');
    expect(item.seller.name).toBe('Test Seller');

    const allReservations = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.buyerId, BUYER_ID));
    expect(allReservations).toHaveLength(1);
    expect(allReservations[0].quantityOz).toBe('10.00');
  });

  it('should successfully remove an existing reservation', async () => {
    const [reservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning();

    const success = await cartRepository.removeFromCart(BUYER_ID, reservation.id);
    expect(success).toBe(true);

    const check = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, reservation.id));
    expect(check).toHaveLength(0);
  });

  it('should return false if removing a non-existent reservation', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const success = await cartRepository.removeFromCart(BUYER_ID, fakeUuid);

    expect(success).toBe(false);
  });

  it('should return false if reservation belongs to another buyer', async () => {
    const [reservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning();

    const OTHER_BUYER_ID = 'different_buyer_123';
    const success = await cartRepository.removeFromCart(OTHER_BUYER_ID, reservation.id);

    expect(success).toBe(false);

    const check = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, reservation.id));
    expect(check).toHaveLength(1);
  });

  it('should globally delete expired reservations for all buyers', async () => {
    const BUYER_2_ID = 'buyer_repo_2';
    await testDb.insert(users).values([{ id: BUYER_2_ID, email: 'buyer2@test.com' }]);

    const now = new Date();
    const pastDate = new Date(now.getTime() - 1000 * 60 * 10);
    const futureDate = new Date(now.getTime() + 1000 * 60 * 10);

    await testDb.insert(cartReservations).values([
      { buyerId: BUYER_ID, productId: product_id, quantityOz: '1', expiresAt: pastDate },
      { buyerId: BUYER_2_ID, productId: product_id, quantityOz: '2', expiresAt: pastDate },
      { buyerId: BUYER_2_ID, productId: product_id, quantityOz: '3', expiresAt: futureDate },
    ]);

    const deletedCount = await cartRepository.releaseExpiredCarts();

    expect(deletedCount).toBe(2);

    const remaining = await testDb.select().from(cartReservations);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].quantityOz).toBe('3.00');
    expect(remaining[0].buyerId).toBe(BUYER_2_ID);
  });

  it('should successfully update quantity and subscription, and reset expiration', async () => {
    const oldDate = new Date(Date.now() + 5 * 60 * 1000); // 5 mins from now
    const [reservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        isSubscription: false,
        expiresAt: oldDate,
      })
      .returning();

    const payload = {
      quantityOz: 12.5,
      isSubscription: true,
    };

    const success = await cartRepository.updateCartItem(BUYER_ID, reservation.id, payload);
    expect(success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, reservation.id));

    expect(updated.quantityOz).toBe('12.50');
    expect(updated.isSubscription).toBe(true);

    // Verify expiration was extended to ~15 mins from now
    const now = new Date();
    const diffMins = (updated.expiresAt.getTime() - now.getTime()) / (1000 * 60);
    expect(diffMins).toBeGreaterThan(14);
    expect(diffMins).toBeLessThan(16);
  });

  it('should allow partial updates (only quantity)', async () => {
    const [reservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        isSubscription: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning();

    const success = await cartRepository.updateCartItem(BUYER_ID, reservation.id, {
      quantityOz: 20,
    });
    expect(success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(cartReservations)
      .where(eq(cartReservations.id, reservation.id));

    expect(updated.quantityOz).toBe('20.00');
    expect(updated.isSubscription).toBe(true); // Should remain unchanged
  });

  it('should return false if updating a non-existent reservation', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const success = await cartRepository.updateCartItem(BUYER_ID, fakeUuid, { quantityOz: 10 });

    expect(success).toBe(false);
  });

  it('should return false if updating a reservation belonging to another buyer', async () => {
    const OTHER_BUYER = 'buyer_repo_999';
    const [reservation] = await testDb
      .insert(cartReservations)
      .values({
        buyerId: BUYER_ID,
        productId: product_id,
        quantityOz: '5',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      .returning();

    const success = await cartRepository.updateCartItem(OTHER_BUYER, reservation.id, {
      quantityOz: 10,
    });
    expect(success).toBe(false);
  });
});
