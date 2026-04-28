import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';
import {
  closeTestDbConnection,
  getTestDb,
  truncateTables,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations, cartGroups } from '../../../src/db/schema.js';

describe('Cron API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_SECRET = 'super-secret-cron-token';
  let originalSecret: string | undefined;

  beforeAll(() => {
    testDb = getTestDb();
    cartRepository.setDb(testDb);
    originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    process.env.CRON_SECRET = originalSecret;
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  describe('POST /api/cron/release-carts', () => {
    it('should securely release expired items globally and clean up empty groups', async () => {
      const SELLER_ID = 'cron_seller';
      const BUYER_ID = 'cron_buyer';

      await testDb.insert(users).values([
        { id: SELLER_ID, name: 'Seller', email: 's@example.com' },
        { id: BUYER_ID, name: 'Buyer', email: 'b@example.com' },
      ]);

      const [group] = await testDb
        .insert(cartGroups)
        .values({
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          fulfillmentType: 'pickup',
        })
        .returning();

      const [p] = await testDb
        .insert(produce)
        .values([
          {
            sellerId: SELLER_ID,
            title: 'Test Apples',
            pricePerOz: '0.20',
            totalOzInventory: '50',
            harvestFrequencyDays: 1,
            seasonStart: '2024-01-01',
            seasonEnd: '2024-12-31',
          },
        ])
        .returning();

      const now = new Date();

      await testDb.insert(cartReservations).values([
        {
          groupId: group.id, // Linked to group
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '1.00',
          expiresAt: new Date(now.getTime() - 10000), // Expired
        },
        {
          groupId: group.id,
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '2.00',
          expiresAt: new Date(now.getTime() - 10000), // Expired
        },
        {
          groupId: group.id,
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '3.00',
          expiresAt: new Date(now.getTime() + 60000), // Valid
        },
      ]);

      const res = await authedRequest(
        '/api/cron/release-carts',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${TEST_SECRET}` },
        },
        { id: '' },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(2);

      // Verify reservations
      const items = await testDb.select().from(cartReservations);
      expect(items).toHaveLength(1);
      expect(items[0].quantityOz).toBe('3.00');

      // Verify the group still exists because 1 item remains
      const groups = await testDb.select().from(cartGroups);
      expect(groups).toHaveLength(1);
    });

    it('should fail with 401 if wrong token provided', async () => {
      const res = await authedRequest(
        '/api/cron/release-carts',
        {
          method: 'POST',
          headers: { authorization: 'Bearer WRONG_TOKEN' },
        },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });
  });
});
