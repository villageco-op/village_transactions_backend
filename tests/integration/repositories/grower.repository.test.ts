import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { growerRepository } from '../../../src/repositories/grower.repository.js';
import { users, orders, reviews } from '../../../src/db/schema.js';

describe('GrowerRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const BUYER_ID = 'map_buyer_123';
  const OTHER_BUYER_ID = 'buyer_234';
  const SELLER_CHICAGO_ID = 'map_seller_chicago_123';
  const SELLER_EVANSTON_ID = 'map_seller_evanston_123';
  const SELLER_SPRINGFIELD_ID = 'map_seller_springfield_123';

  beforeAll(() => {
    testDb = getTestDb();
    growerRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      {
        id: BUYER_ID,
        name: 'Map Buyer',
        lat: 41.8781, // Chicago
        lng: -87.6298,
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`,
      },
      {
        id: OTHER_BUYER_ID,
        name: 'Other Buyer',
        lat: 41.8782, // Chicago
        lng: -87.6298,
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8782), 4326)`,
      },
      {
        id: SELLER_CHICAGO_ID,
        name: 'Chicago Farm',
        lat: 41.8819, // Very close to buyer
        lng: -87.6231,
        image: 'chicago.jpg',
        location: sql`ST_SetSRID(ST_MakePoint(-87.6231, 41.8819), 4326)`,
        stripeOnboardingComplete: true,
      },
      {
        id: SELLER_EVANSTON_ID,
        name: 'Evanston Farm',
        lat: 42.0451, // ~12 miles away
        lng: -87.6877,
        image: 'evanston.jpg',
        location: sql`ST_SetSRID(ST_MakePoint(-87.6877, 42.0451), 4326)`,
        stripeOnboardingComplete: true,
      },
      {
        id: SELLER_SPRINGFIELD_ID,
        name: 'Springfield Farm',
        lat: 39.7817, // ~200 miles away
        lng: -89.6501,
        location: sql`ST_SetSRID(ST_MakePoint(-89.6501, 39.7817), 4326)`,
        stripeOnboardingComplete: true,
      },
      {
        id: 'no_location_seller', // Should be excluded due to no coordinates
        name: 'Ghost Farm',
        location: null,
        stripeOnboardingComplete: true,
      },
    ]);

    const now = new Date();

    const [order1, order2, pendingOrder] = await testDb
      .insert(orders)
      .values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_CHICAGO_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: now,
          totalAmount: '10.00',
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_SPRINGFIELD_ID,
          status: 'completed',
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '20.00',
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_EVANSTON_ID,
          status: 'pending', // Pending order shouldn't satisfy buyerId filter
          paymentMethod: 'card',
          fulfillmentType: 'delivery',
          scheduledTime: now,
          totalAmount: '15.00',
        },
      ])
      .returning();

    await testDb.insert(reviews).values([
      { buyerId: BUYER_ID, sellerId: SELLER_CHICAGO_ID, orderId: order1.id, rating: 5 },
      { buyerId: OTHER_BUYER_ID, sellerId: SELLER_CHICAGO_ID, orderId: order2.id, rating: 4 }, // Average rating should be 4.5
      { buyerId: BUYER_ID, sellerId: SELLER_SPRINGFIELD_ID, orderId: order2.id, rating: 3 },
    ]);
  });

  it('should fetch all growers with valid coordinates and aggregate average ratings', async () => {
    const results = await growerRepository.getGrowersForMap({});

    expect(results).toHaveLength(3); // Excludes 'no_location_seller'

    const chicagoFarm = results.find((r) => r.sellerId === SELLER_CHICAGO_ID);
    expect(chicagoFarm?.name).toBe('Chicago Farm');
    expect(Number(chicagoFarm?.rating)).toBe(4.5); // (5 + 4) / 2

    const evanstonFarm = results.find((r) => r.sellerId === SELLER_EVANSTON_ID);
    expect(Number(evanstonFarm?.rating)).toBe(0); // No reviews
  });

  it('should filter by buyerId, showing only growers with completed orders', async () => {
    const results = await growerRepository.getGrowersForMap({ buyerId: BUYER_ID });

    // Should only return Chicago and Springfield (Evanston is 'pending')
    expect(results).toHaveLength(2);
    const sellerIds = results.map((r) => r.sellerId).sort();
    expect(sellerIds).toEqual([SELLER_CHICAGO_ID, SELLER_SPRINGFIELD_ID].sort());
  });

  it('should filter growers by maxDistance', async () => {
    const filters = {
      lat: 41.8781,
      lng: -87.6298, // Chicago Center
      maxDistance: 15, // 15 miles
    };

    const results = await growerRepository.getGrowersForMap(filters);

    // Should include Chicago Farm (<1 mile), Evanston Farm (~12 miles)
    // Excludes Springfield Farm (~200 miles)
    expect(results).toHaveLength(2);
    const sellerIds = results.map((r) => r.sellerId);
    expect(sellerIds).not.toContain(SELLER_SPRINGFIELD_ID);
    expect(sellerIds).toContain(SELLER_EVANSTON_ID);
  });

  it('should apply both distance and buyerId filters simultaneously', async () => {
    const filters = {
      buyerId: BUYER_ID,
      lat: 41.8781,
      lng: -87.6298,
      maxDistance: 15,
    };

    const results = await growerRepository.getGrowersForMap(filters);

    // Only Chicago Farm fits both criteria (Completed order AND within 15 miles)
    expect(results).toHaveLength(1);
    expect(results[0].sellerId).toBe(SELLER_CHICAGO_ID);
  });
});
