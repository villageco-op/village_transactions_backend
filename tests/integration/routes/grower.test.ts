import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { growerRepository } from '../../../src/repositories/grower.repository.js';
import { users } from '../../../src/db/schema.js';

describe('Growers API Integration', { timeout: 60_000 }, () => {
  let testDb: any;

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
        id: 'map_seller_1',
        name: 'Local Map Seller',
        lat: 36.05,
        lng: -119.0,
        location: sql`ST_SetSRID(ST_MakePoint(-119.0, 36.05), 4326)`,
        stripeOnboardingComplete: true,
      },
    ]);
  });

  describe('GET /api/growers/growers-map', () => {
    it('should return 200 and list of map markers', async () => {
      const res = await authedRequest(`/api/growers/growers-map`, { method: 'GET' }, {});
      expect(res.status).toBe(200);

      const data = (await res.json()) as any;
      expect(data).toHaveLength(1);

      // Ensure only lightweight fields are exposed
      const marker = data[0];
      expect(marker).toHaveProperty('sellerId', 'map_seller_1');
      expect(marker).toHaveProperty('lat', 36.05);
      expect(marker).toHaveProperty('lng', -119.0);
      expect(marker).toHaveProperty('rating');
      expect(marker).not.toHaveProperty('location'); // Raw db geography shouldn't leak
      expect(marker).not.toHaveProperty('address');
    });

    it('should allow valid complete geographic filtering', async () => {
      const url = `/api/growers/growers-map?lat=36.0&lng=-119.0&maxDistance=10`;
      const res = await authedRequest(url, { method: 'GET' }, {});

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data).toHaveLength(1); // 36.05 is within 10 miles of 36.0
    });

    it('should return 400 Bad Request if missing one of the location parameters', async () => {
      // Provided lat and maxDistance, but forgot lng
      const url = `/api/growers/growers-map?lat=36.0&maxDistance=10`;
      const res = await authedRequest(url, { method: 'GET' }, {});

      expect(res.status).toBe(400);
      const errorData = await res.json();
      expect(errorData.error).toContain('lat, lng, and maxDistance must all be provided together');
    });
  });
});
