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

  it('PUT /api/produce/:id should return 200 and update the DB listing', async () => {
    // 1. Create a listing directly in DB to guarantee it exists
    const [dbProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: TEST_USER_ID,
        title: 'Plums',
        produceType: 'fruit',
        pricePerOz: '0.40',
        totalOzInventory: '300',
        harvestFrequencyDays: 5,
        seasonStart: '2024-05-01',
        seasonEnd: '2024-07-31',
        images: [],
        status: 'active',
      })
      .returning();

    // 2. Perform PUT request to update it
    const res = await authedRequest(
      `/api/produce/${dbProduce.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          status: 'paused',
          totalOzInventory: 250, // decreased inventory
        }),
      },
      { id: TEST_USER_ID },
    );

    // 3. Assert Route Response
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, id: dbProduce.id });

    // 4. Assert DB changes occurred
    const [updatedDbProduce] = await testDb
      .select()
      .from(produce)
      .where(eq(produce.id, dbProduce.id));
    expect(updatedDbProduce.status).toBe('paused');
    expect(updatedDbProduce.totalOzInventory).toBe('250.00');
  });

  it('PUT /api/produce/:id should return 400 for an invalid UUID format', async () => {
    const res = await authedRequest(
      '/api/produce/invalid_id_format',
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      },
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(400); // Because param validation expects a UUID
  });

  it('PUT /api/produce/:id should return 400 if the request body is empty', async () => {
    const dummyId = crypto.randomUUID();
    const res = await authedRequest(
      `/api/produce/${dummyId}`,
      {
        method: 'PUT',
        body: JSON.stringify({}), // empty body
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
  });

  it('PUT /api/produce/:id should return 404 for a non-existent or unauthorized listing', async () => {
    const randomValidId = crypto.randomUUID();
    const res = await authedRequest(
      `/api/produce/${randomValidId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Listing not found or unauthorized');
  });

  it('DELETE /api/produce/:id should return 200', async () => {
    const validDummyId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await authedRequest(
      `/api/produce/${validDummyId}`,
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
