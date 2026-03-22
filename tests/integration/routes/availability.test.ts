import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { availabilityRepository } from '../../../src/repositories/availability.repository.js';
import { users, scheduleRules, orders } from '../../../src/db/schema.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';

describe('Availability API Route Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const SELLER_ID = 'route_seller_123';
  const BUYER_ID = 'route_buyer_123';

  beforeAll(() => {
    testDb = getTestDb();
    availabilityRepository.setDb(testDb);
    scheduleRuleRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: SELLER_ID, email: 'route.seller@example.com' },
      { id: BUYER_ID, email: 'route.buyer@example.com' },
    ]);
  });

  it('GET /api/availability/:sellerId should return 200 and available slots array', async () => {
    // 2050-01-07 is a Friday
    await testDb.insert(scheduleRules).values({
      sellerId: SELLER_ID,
      dayOfWeek: 'Friday',
      type: 'delivery',
      startTime: '09:00',
      endTime: '11:00',
    });

    await testDb.insert(orders).values({
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      paymentMethod: 'card',
      fulfillmentType: 'delivery',
      scheduledTime: new Date('2050-01-07T09:30:00Z'),
      totalAmount: '30.00',
      status: 'pending',
    });

    const res = await authedRequest(
      `/api/availability/${SELLER_ID}?type=delivery&date=2050-01-07`,
      {},
      { id: BUYER_ID },
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    // Bounds: 09:00 to 11:00 = 09:00, 09:30, 10:00, 10:30
    // But 09:30 is booked.
    expect(body).toEqual([
      '2050-01-07T09:00:00.000Z',
      '2050-01-07T10:00:00.000Z',
      '2050-01-07T10:30:00.000Z',
    ]);
  });

  it('GET /api/availability/:sellerId should return 400 Bad Request if query params are missing', async () => {
    const res = await authedRequest(`/api/availability/${SELLER_ID}`, {}, { id: BUYER_ID });

    expect(res.status).toBe(400); // Triggered by Zod Validation in Hono
  });

  it('GET /api/availability/:sellerId should return 400 Bad Request for invalid type enum', async () => {
    const res = await authedRequest(
      `/api/availability/${SELLER_ID}?type=teleport&date=2050-01-07`,
      {},
      { id: BUYER_ID },
    );

    expect(res.status).toBe(400);
  });
});
