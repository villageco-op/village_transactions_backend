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
});
