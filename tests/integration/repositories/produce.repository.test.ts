import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { users, produce } from '../../../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

describe('ProduceRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_SELLER_ID = 'seller_repo_123';
  const OTHER_SELLER_ID = 'seller_repo_999';

  beforeAll(() => {
    testDb = getTestDb();
    produceRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      {
        id: TEST_SELLER_ID,
        name: 'Farmer Joe',
        email: 'joe@farm.com',
        passwordHash: 'hashed_pw',
        // Location: Madison, WI (-89.4012, 43.0731)
        location: sql`ST_SetSRID(ST_MakePoint(-89.4012, 43.0731), 4326)`,
        deliveryRangeMiles: '15',
      },
      {
        id: OTHER_SELLER_ID,
        name: 'Farmer Jane',
        email: 'jane@farm.com',
        passwordHash: 'hashed_pw_2',
        // Location: Chicago, IL (-87.6298, 41.8781) (Far away)
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`,
        deliveryRangeMiles: '5',
      },
    ]);
  });

  it('should create and retrieve a produce listing successfully', async () => {
    const payload = {
      title: 'Fresh Strawberries',
      produceType: 'fruit',
      pricePerOz: 1.25,
      totalOzInventory: 500,
      harvestFrequencyDays: 3,
      seasonStart: '2024-06-01',
      seasonEnd: '2024-08-31',
      images: ['https://example.com/strawberry.jpg'],
      isSubscribable: true,
    };

    const newProduce = await produceRepository.create(TEST_SELLER_ID, payload);

    expect(newProduce).toBeDefined();
    expect(newProduce.id).toBeDefined();
    expect(newProduce.sellerId).toBe(TEST_SELLER_ID);
    expect(newProduce.title).toBe('Fresh Strawberries');
    expect(newProduce.produceType).toBe('fruit');

    expect(newProduce.pricePerOz).toBe('1.25');
    expect(newProduce.totalOzInventory).toBe('500.00');

    expect(newProduce.harvestFrequencyDays).toBe(3);
    expect(newProduce.seasonStart).toBe('2024-06-01');
    expect(newProduce.seasonEnd).toBe('2024-08-31');
    expect(newProduce.images).toEqual(['https://example.com/strawberry.jpg']);
    expect(newProduce.isSubscribable).toBe(true);

    expect(newProduce.status).toBe('active');
    expect(newProduce.createdAt).toBeInstanceOf(Date);
    expect(newProduce.updatedAt).toBeInstanceOf(Date);
  });

  it('should throw an error if the sellerId does not exist (Foreign Key Constraint)', async () => {
    const payload = {
      title: 'Ghost Apples',
      produceType: 'fruit',
      pricePerOz: 2.0,
      totalOzInventory: 100,
      harvestFrequencyDays: 7,
      seasonStart: '2024-09-01',
      seasonEnd: '2024-11-30',
      images: [],
      isSubscribable: false,
    };

    await expect(produceRepository.create('missing_seller_999', payload)).rejects.toThrow();
  });

  it('should update an existing produce listing successfully', async () => {
    const createPayload = {
      title: 'Watermelons',
      produceType: 'fruit',
      pricePerOz: 0.1,
      totalOzInventory: 1000,
      harvestFrequencyDays: 14,
      seasonStart: '2024-07-01',
      seasonEnd: '2024-09-30',
      images: [],
      isSubscribable: false,
    };

    const created = await produceRepository.create(TEST_SELLER_ID, createPayload);

    const updatePayload = {
      status: 'paused' as const,
      pricePerOz: 0.15,
      totalOzInventory: 800,
    };

    const updated = await produceRepository.update(created.id, TEST_SELLER_ID, updatePayload);

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(created.id);
    expect(updated?.status).toBe('paused');
    expect(updated?.pricePerOz).toBe('0.15');
    expect(updated?.totalOzInventory).toBe('800.00');
    // Ensure unchanged properties remain intact
    expect(updated?.title).toBe('Watermelons');
  });

  it('should return undefined when trying to update a listing owned by another seller', async () => {
    const createPayload = {
      title: 'Golden Potatoes',
      produceType: 'vegetable',
      pricePerOz: 0.05,
      totalOzInventory: 2000,
      harvestFrequencyDays: 30,
      seasonStart: '2024-08-01',
      seasonEnd: '2024-11-30',
      images: [],
      isSubscribable: false,
    };

    const created = await produceRepository.create(TEST_SELLER_ID, createPayload);

    const updatePayload = {
      status: 'deleted' as const,
    };

    // Try to update with a different seller ID
    const updated = await produceRepository.update(created.id, OTHER_SELLER_ID, updatePayload);

    expect(updated).toBeUndefined();
  });

  it('should soft delete an existing produce listing successfully', async () => {
    const createPayload = {
      title: 'Peaches',
      produceType: 'fruit',
      pricePerOz: 0.2,
      totalOzInventory: 300,
      harvestFrequencyDays: 5,
      seasonStart: '2024-06-01',
      seasonEnd: '2024-08-31',
      images: ['https://example.com/peach1.jpg', 'https://example.com/peach2.jpg'],
      isSubscribable: false,
    };

    const created = await produceRepository.create(TEST_SELLER_ID, createPayload);

    const success = await produceRepository.softDelete(created.id, TEST_SELLER_ID);
    expect(success).toBe(true);

    const [dbProduce] = await testDb.select().from(produce).where(eq(produce.id, created.id));

    expect(dbProduce).toBeDefined();
    expect(dbProduce.status).toBe('deleted'); // Status updated
    expect(dbProduce.images).toEqual([]); // Images cleared
  });

  it('should return false when trying to soft delete a listing owned by another seller', async () => {
    const createPayload = {
      title: 'Onions',
      produceType: 'vegetable',
      pricePerOz: 0.08,
      totalOzInventory: 1000,
      harvestFrequencyDays: 30,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/onion.jpg'],
      isSubscribable: false,
    };

    const created = await produceRepository.create(TEST_SELLER_ID, createPayload);

    // Attempt to soft delete with a different seller ID
    const success = await produceRepository.softDelete(created.id, OTHER_SELLER_ID);

    expect(success).toBe(false);

    // Verify the record is untouched
    const [dbProduce] = await testDb.select().from(produce).where(eq(produce.id, created.id));
    expect(dbProduce.status).toBe('active');
    expect(dbProduce.images).toEqual(['https://example.com/onion.jpg']);
  });

  describe('getList', () => {
    beforeEach(async () => {
      await testDb.insert(produce).values([
        {
          sellerId: TEST_SELLER_ID,
          title: 'Joe Carrots (Expensive, Close)',
          produceType: 'vegetable',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          availableBy: new Date(),
          status: 'active',
        },
        {
          sellerId: OTHER_SELLER_ID,
          title: 'Jane Carrots (Cheap, Far)',
          produceType: 'vegetable',
          pricePerOz: '0.25',
          totalOzInventory: '500',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          availableBy: new Date(),
          status: 'active',
        },
      ]);
    });

    it('should sort by spatial distance by default', async () => {
      // Query coordinates near Madison, WI
      const result = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveLength(2);
      // First item should be Joe (Madison) because it's closer
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[1].sellerId).toBe(OTHER_SELLER_ID);

      expect(Number(result[0].distance)).toBeLessThan(Number(result[1].distance));
    });

    it('should sort by price when requested', async () => {
      const result = await produceRepository.getList({
        lat: 43.0, // Near Madison again
        lng: -89.4,
        sortBy: 'price',
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveLength(2);
      // First item should be Jane (Chicago) because it's cheaper (0.25 vs 1.00)
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
      expect(result[1].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by hasDelivery logic and deliveryRangeMiles', async () => {
      // Query exactly where Jane is (Chicago)
      // Jane has a delivery radius of 5 miles. Joe is 100+ miles away.
      const result = await produceRepository.getList({
        lat: 41.8781,
        lng: -87.6298,
        hasDelivery: 'true',
        limit: 10,
        offset: 0,
      });

      // Joe shouldn't be here because he's too far for his 15mi delivery radius to cover Chicago.
      // Jane SHOULD be here because she is right at the location (0mi distance) which is <= 5mi radius.
      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });
  });
});
