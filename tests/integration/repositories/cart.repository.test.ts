import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce } from '../../../src/db/schema.js';

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
      { id: BUYER_ID, email: 'buyer@test.com' },
      { id: SELLER_ID, email: 'seller@test.com' },
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
});
