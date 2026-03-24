import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { users, produce, orderItems, orders } from '../../../src/db/schema.js';

describe('Produce API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'test_auth_seller_123';

  beforeAll(() => {
    testDb = getTestDb();
    produceRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values({
      id: TEST_USER_ID,
      name: 'Integration Seller',
      email: 'seller.api@example.com',
      passwordHash: 'secret_hash',
      location: sql`ST_SetSRID(ST_MakePoint(-90.0, 45.0), 4326)`,
      deliveryRangeMiles: '20',
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

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, id: dbProduce.id });

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

  it('DELETE /api/produce/:id should return 200 and soft delete the DB listing', async () => {
    const [dbProduce] = await testDb
      .insert(produce)
      .values({
        sellerId: TEST_USER_ID,
        title: 'Cherries',
        produceType: 'fruit',
        pricePerOz: '0.60',
        totalOzInventory: '150',
        harvestFrequencyDays: 1,
        seasonStart: '2024-06-01',
        seasonEnd: '2024-07-31',
        images: ['https://example.com/cherry.jpg'],
        status: 'active',
      })
      .returning();

    const res = await authedRequest(
      `/api/produce/${dbProduce.id}`,
      {
        method: 'DELETE',
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });

    const [updatedDbProduce] = await testDb
      .select()
      .from(produce)
      .where(eq(produce.id, dbProduce.id));
    expect(updatedDbProduce.status).toBe('deleted');
    expect(updatedDbProduce.images).toEqual([]);
  });

  it('DELETE /api/produce/:id should return 400 for an invalid UUID format', async () => {
    const res = await authedRequest(
      '/api/produce/invalid_id_format',
      {
        method: 'DELETE',
      },
      { id: TEST_USER_ID },
    );
    expect(res.status).toBe(400);
  });

  it('DELETE /api/produce/:id should return 404 for a non-existent or unauthorized listing', async () => {
    const randomValidId = crypto.randomUUID();
    const res = await authedRequest(
      `/api/produce/${randomValidId}`,
      {
        method: 'DELETE',
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Listing not found or unauthorized');
  });

  it('GET /api/produce/list should return 200 with correctly mapped fields', async () => {
    await testDb.insert(produce).values({
      sellerId: TEST_USER_ID,
      title: 'Plums',
      produceType: 'fruit',
      pricePerOz: '0.40',
      totalOzInventory: '300',
      harvestFrequencyDays: 5,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-07-31',
      availableBy: new Date(),
      images: ['https://example.com/plum1.jpg', 'https://example.com/plum2.jpg'],
      status: 'active',
    });

    const res = await authedRequest(
      '/api/produce/list?lat=45.0&lng=-90.0&limit=10',
      {},
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const firstItem = body[0];

    expect(firstItem).toHaveProperty('id');
    expect(firstItem).toHaveProperty('name', 'Plums');
    expect(firstItem).toHaveProperty('sellerName', 'Integration Seller');
    expect(firstItem).toHaveProperty('sellerId', TEST_USER_ID);
    expect(firstItem).toHaveProperty('price', '0.40');
    expect(firstItem).toHaveProperty('amount', '300.00');
    expect(firstItem).toHaveProperty('availableBy');
    expect(firstItem).toHaveProperty('distance');
    expect(typeof firstItem.distance).toBe('number');
    expect(firstItem).toHaveProperty('thumbnail', 'https://example.com/plum1.jpg');
  });

  it('GET /api/produce/list should filter by delivery capability when requested', async () => {
    const NO_DELIVERY_USER = 'no_delivery_user';
    await testDb.insert(users).values({
      id: NO_DELIVERY_USER,
      name: 'No Delivery Seller',
      location: sql`ST_SetSRID(ST_MakePoint(-90.0, 45.0), 4326)`,
      deliveryRangeMiles: '0',
    });

    await testDb.insert(produce).values([
      {
        sellerId: TEST_USER_ID,
        title: 'Delivery Apples',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 1,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
        availableBy: new Date(),
        status: 'active',
      },
      {
        sellerId: NO_DELIVERY_USER,
        title: 'Pickup Only Apples',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 1,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
        availableBy: new Date(),
        status: 'active',
      },
    ]);

    const res = await authedRequest(
      '/api/produce/list?lat=45.0&lng=-90.0&hasDelivery=true',
      {},
      { id: TEST_USER_ID },
    );

    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].sellerId).toBe(TEST_USER_ID);
    expect(body[0].name).toBe('Delivery Apples');
  });

  it('GET /api/produce/map should return 200 and correctly grouped sellers', async () => {
    await testDb.insert(produce).values([
      {
        sellerId: TEST_USER_ID,
        title: 'Map Apples',
        produceType: 'fruit',
        pricePerOz: '0.50',
        totalOzInventory: '100',
        harvestFrequencyDays: 1,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
        images: ['https://example.com/map_apple.jpg'],
        status: 'active',
      },
      {
        sellerId: TEST_USER_ID,
        title: 'Map Carrots',
        produceType: 'vegetable',
        pricePerOz: '0.25',
        totalOzInventory: '100',
        harvestFrequencyDays: 1,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
        images: [],
        status: 'active',
      },
    ]);

    const res = await authedRequest(
      '/api/produce/map?lat=45.0&lng=-90.0&radiusMiles=10',
      {},
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const sellerGroup = body[0];
    expect(sellerGroup).toHaveProperty('sellerId', TEST_USER_ID);
    expect(sellerGroup).toHaveProperty('lat', 45.0);
    expect(sellerGroup).toHaveProperty('lng', -90.0);

    expect(sellerGroup.produce).toHaveLength(2);
    expect(sellerGroup.produce[0].name).toBe('Map Apples');
    expect(sellerGroup.produce[0].thumbnail).toBe('https://example.com/map_apple.jpg');

    expect(sellerGroup.produce[1].name).toBe('Map Carrots');
    expect(sellerGroup.produce[1].thumbnail).toBeNull();
  });

  describe('GET /api/produce/:id/orders', () => {
    const BUYER_ID = 'buyer_integration_123';

    beforeEach(async () => {
      await testDb.insert(users).values({
        id: BUYER_ID,
        name: 'Hungry Buyer',
        email: 'buyer.api@example.com',
      });
    });

    it('should return 200 and a paginated list of orders for the seller', async () => {
      const [dbProduce] = await testDb
        .insert(produce)
        .values({
          sellerId: TEST_USER_ID,
          title: 'Tomatoes',
          produceType: 'vegetable',
          pricePerOz: '0.20',
          totalOzInventory: '500',
          harvestFrequencyDays: 3,
          seasonStart: '2024-06-01',
          seasonEnd: '2024-09-30',
        })
        .returning();

      const [dbOrder] = await testDb
        .insert(orders)
        .values({
          buyerId: BUYER_ID,
          sellerId: TEST_USER_ID,
          stripeSessionId: crypto.randomUUID(),
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          status: 'pending',
          totalAmount: '5.00',
        })
        .returning();

      await testDb.insert(orderItems).values({
        orderId: dbOrder.id,
        productId: dbProduce.id,
        quantityOz: '25',
        pricePerOz: '0.20',
      });

      const res = await authedRequest(
        `/api/produce/${dbProduce.id}/orders?limit=5&offset=0`,
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(1);

      const firstItem = body[0];
      expect(firstItem.id).toBe(dbOrder.id);
      expect(firstItem.status).toBe('pending');
      expect(firstItem.fulfillmentType).toBe('pickup');
      expect(firstItem.quantityOz).toBe('25.00');
      expect(firstItem.totalAmount).toBe('5.00');
      expect(firstItem.buyer.id).toBe(BUYER_ID);
      expect(firstItem.buyer.name).toBe('Hungry Buyer');
    });

    it('should return 401 if unauthenticated', async () => {
      const randomValidId = crypto.randomUUID();
      const res = await authedRequest(
        `/api/produce/${randomValidId}/orders`,
        { method: 'GET' },
        { id: '' }, // No session
      );
      expect(res.status).toBe(401);
    });

    it('should return 404 if the produce does not exist or user is not the seller', async () => {
      const OTHER_SELLER_ID = 'other_seller_999';
      await testDb.insert(users).values({ id: OTHER_SELLER_ID, email: 'other@example.com' });

      const [otherProduce] = await testDb
        .insert(produce)
        .values({
          sellerId: OTHER_SELLER_ID,
          title: 'Not Your Produce',
          produceType: 'vegetable',
          pricePerOz: '1.00',
          totalOzInventory: '10',
          harvestFrequencyDays: 1,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
        })
        .returning();

      // Requested by TEST_USER_ID (not the owner)
      const res = await authedRequest(
        `/api/produce/${otherProduce.id}/orders`,
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Listing not found or unauthorized');
    });

    it('should return 400 for an invalid UUID format in params', async () => {
      const res = await authedRequest(
        '/api/produce/not-a-valid-uuid/orders',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/produce/me', () => {
    beforeEach(async () => {
      const OTHER_SELLER_ID = 'another_seller_xyz';
      await testDb.insert(users).values({
        id: OTHER_SELLER_ID,
        name: 'Another Seller',
        email: 'another@example.com',
      });

      await testDb.insert(produce).values([
        {
          sellerId: TEST_USER_ID,
          title: 'Active Apples',
          pricePerOz: '0.50',
          totalOzInventory: '100',
          harvestFrequencyDays: 1,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
        },
        {
          sellerId: TEST_USER_ID,
          title: 'Paused Peaches',
          pricePerOz: '0.60',
          totalOzInventory: '50',
          harvestFrequencyDays: 1,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'paused',
        },
        {
          sellerId: OTHER_SELLER_ID,
          title: 'Other Users Oranges',
          pricePerOz: '0.40',
          totalOzInventory: '200',
          harvestFrequencyDays: 1,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
        },
      ]);
    });

    it('should return 200 and a list of the authenticated sellers own listings', async () => {
      const res = await authedRequest(
        '/api/produce/me?limit=10&offset=0',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);

      const titles = body.map((item: any) => item.title);
      expect(titles).toContain('Active Apples');
      expect(titles).toContain('Paused Peaches');
      expect(titles).not.toContain('Other Users Oranges');
    });

    it('should correctly filter the sellers listings by status', async () => {
      const res = await authedRequest(
        '/api/produce/me?limit=10&offset=0&status=paused',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toHaveLength(1);
      expect(body[0].title).toBe('Paused Peaches');
      expect(body[0].status).toBe('paused');
    });

    it('should return 401 if the user is unauthenticated', async () => {
      const res = await authedRequest('/api/produce/me', { method: 'GET' }, { id: '' });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });
  });
});
