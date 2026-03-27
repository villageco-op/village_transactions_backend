import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { availabilityRepository } from '../../../src/repositories/availability.repository.js';
import { users, orders } from '../../../src/db/schema.js';

describe('AvailabilityRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'test_seller_avail_123';
  const BUYER_ID = 'test_buyer_avail_123';

  beforeAll(() => {
    testDb = getTestDb();
    availabilityRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: SELLER_ID, email: 'seller.avail@example.com' },
      { id: BUYER_ID, email: 'buyer.avail@example.com' },
    ]);
  });

  describe('getActiveOrders', () => {
    it('should fetch only non-canceled orders strictly within the date bounds', async () => {
      const targetStart = new Date('2050-05-10T00:00:00Z');
      const targetEnd = new Date('2050-05-10T23:59:59Z');

      await testDb.insert(orders).values([
        // Valid active order strictly within bounds
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date('2050-05-10T10:00:00Z'),
          totalAmount: '10.50',
          status: 'pending',
        },
        // Valid active order inside bounds
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date('2050-05-10T14:30:00Z'),
          totalAmount: '20.00',
          status: 'completed',
        },
        // Canceled order inside bounds (should be ignored)
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date('2050-05-10T11:00:00Z'),
          totalAmount: '5.00',
          status: 'canceled',
        },
        // Active order outside of bounds (should be ignored)
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date('2050-05-11T10:00:00Z'), // Next day
          totalAmount: '15.00',
          status: 'pending',
        },
      ]);

      const activeOrders = await availabilityRepository.getActiveOrders(
        SELLER_ID,
        targetStart,
        targetEnd,
      );

      expect(activeOrders).toHaveLength(2);
      expect(
        activeOrders.some(
          (o) => new Date(o.scheduledTime).toISOString() === '2050-05-10T10:00:00.000Z',
        ),
      ).toBe(true);
      expect(
        activeOrders.some(
          (o) => new Date(o.scheduledTime).toISOString() === '2050-05-10T14:30:00.000Z',
        ),
      ).toBe(true);
    });
  });
});
