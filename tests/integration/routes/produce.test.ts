import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { authedRequest } from '../../test-utils/auth.js';
import { createTestDb, closeTestDb, truncateTables } from '../../test-utils/testcontainer-db.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { users, produce } from '../../../src/db/schema.js';

describe('Produce API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'test_auth_seller_123';

  beforeAll(async () => {
    testDb = await createTestDb();
    produceRepository.setDb(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values({
      id: TEST_USER_ID,
      name: 'Integration Seller',
      email: 'seller.api@example.com',
      passwordHash: 'secret_hash',
    });
  });

  it('GET /api/produce/map should return 200', async () => {
    const res = await authedRequest(
      '/api/produce/map?lat=45.0&lng=-90.0&radiusMiles=10',
      {},
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/produce/list should return 200', async () => {
    const res = await authedRequest(
      '/api/produce/list?lat=45.0&lng=-90.0&limit=10',
      {},
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /api/produce/:id should return 200', async () => {
    const res = await authedRequest(
      '/api/produce/prod_123',
      {
        method: 'PUT',
        body: JSON.stringify({
          status: 'active',
          totalOzInventory: 200,
        }),
      },
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('DELETE /api/produce/:id should return 200', async () => {
    const res = await authedRequest(
      '/api/produce/prod_123',
      {
        method: 'DELETE',
      },
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('POST /api/produce should return 201 and insert the listing into the DB', async () => {
    const payload = {
      title: 'Organic Honeycrisp Apples',
      produceType: 'fruit',
      pricePerOz: 0.25,
      totalOzInventory: 500,
      harvestFrequencyDays: 7,
      seasonStart: '2024-09-01',
      seasonEnd: '2024-11-30',
      images: ['https://example.com/apple.jpg'],
      isSubscribable: true,
    };

    const res = await authedRequest(
      '/api/produce',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');

    const [dbProduce] = await testDb.select().from(produce).where(eq(produce.id, body.id));

    expect(dbProduce).toBeDefined();
    expect(dbProduce.title).toBe('Organic Honeycrisp Apples');
    expect(dbProduce.sellerId).toBe(TEST_USER_ID);
    expect(dbProduce.pricePerOz).toBe('0.25');
    expect(dbProduce.status).toBe('active');
  });

  it('POST /api/produce should return 400 for missing required fields', async () => {
    const invalidPayload = {
      produceType: 'vegetable',
      // Missing title, pricePerOz, etc.
    };

    const res = await authedRequest(
      '/api/produce',
      {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);

    const dbProduce = await testDb.select().from(produce);
    expect(dbProduce.length).toBe(0);
  });

  it('POST /api/produce should return 400 for invalid data types (e.g. negative price)', async () => {
    const invalidPayload = {
      title: 'Bad Carrots',
      produceType: 'vegetable',
      pricePerOz: -5.0, // Should be positive
      totalOzInventory: 100,
      harvestFrequencyDays: 7,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: [],
      isSubscribable: false,
    };

    const res = await authedRequest(
      '/api/produce',
      {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
  });

  it('POST /api/produce should return 401 if user is not authenticated', async () => {
    const payload = {
      title: 'Ghost Produce',
      pricePerOz: 1.0,
      totalOzInventory: 10,
      harvestFrequencyDays: 1,
      seasonStart: '2024-01-01',
      seasonEnd: '2024-12-31',
      images: [],
      isSubscribable: false,
    };

    const res = await authedRequest(
      '/api/produce',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: '' }, // Simulates a missing or unauthenticated session
    );

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty('error', 'Unauthorized');
  });
});
