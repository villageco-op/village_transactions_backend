import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  closeTestDbConnection,
  getTestDb,
  truncateTables,
} from '../../test-utils/testcontainer-db.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { users, produce, cartReservations } from '../../../src/db/schema.js';

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
    if (originalSecret !== undefined) {
      process.env.CRON_SECRET = originalSecret;
    } else {
      delete process.env.CRON_SECRET;
    }

    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  describe('POST /api/cron/release-carts', () => {
    it('should securely release expired items globally and return count', async () => {
      const SELLER_ID = 'cron_seller';
      const BUYER_ID = 'cron_buyer';

      await testDb.insert(users).values([
        { id: SELLER_ID, name: 'Seller', email: 's@example.com' },
        { id: BUYER_ID, name: 'Buyer', email: 'b@example.com' },
      ]);

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
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '1',
          expiresAt: new Date(now.getTime() - 10000),
        },
        {
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '2',
          expiresAt: new Date(now.getTime() - 10000),
        },
        {
          buyerId: BUYER_ID,
          productId: p.id,
          quantityOz: '3',
          expiresAt: new Date(now.getTime() + 60000),
        },
      ]);

      const res = await authedRequest(
        '/api/cron/release-carts',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${TEST_SECRET}`,
          },
        },
        { id: '' },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(2);

      const dbCheck = await testDb.select().from(cartReservations);
      expect(dbCheck).toHaveLength(1);
      expect(dbCheck[0].quantityOz).toBe('3.00'); // the future active one
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
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should fail with 400 if no authorization header is provided', async () => {
      const res = await authedRequest('/api/cron/release-carts', { method: 'POST' }, { id: '' });

      expect(res.status).toBe(400);
    });
  });
});
