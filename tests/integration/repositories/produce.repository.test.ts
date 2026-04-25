import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { users, produce, orderItems, orders } from '../../../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { CreateProducePayload } from '../../../src/schemas/produce.schema.js';

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
        city: 'Madison',
        state: 'WI',
        country: 'USA',
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
    const payload: CreateProducePayload = {
      title: 'Fresh Strawberries',
      produceType: 'berries',
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
    expect(newProduce.produceType).toBe('berries');

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
    const payload: CreateProducePayload = {
      title: 'Ghost Apples',
      produceType: 'stone_fruits',
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
    const createPayload: CreateProducePayload = {
      title: 'Watermelons',
      produceType: 'melons',
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
    const createPayload: CreateProducePayload = {
      title: 'Golden Potatoes',
      produceType: 'root_vegetables',
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
    const createPayload: CreateProducePayload = {
      title: 'Peaches',
      produceType: 'pome_fruits',
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
    const createPayload: CreateProducePayload = {
      title: 'Onions',
      produceType: 'root_vegetables',
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
          produceType: 'root_vegetables',
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
          produceType: 'root_vegetables',
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
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
      });

      expect(total).toBe(2);
      expect(result).toHaveLength(2);
      // First item should be Joe (Madison) because it's closer
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[1].sellerId).toBe(OTHER_SELLER_ID);

      expect(Number(result[0].distance)).toBeLessThan(Number(result[1].distance));
    });

    it('should sort by price when requested', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0, // Near Madison again
        lng: -89.4,
        sortBy: 'price',
        limit: 10,
        offset: 0,
      });

      expect(total).toBe(2);
      expect(result).toHaveLength(2);
      // First item should be Jane (Chicago) because it's cheaper (0.25 vs 1.00)
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
      expect(result[1].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by hasDelivery logic and deliveryRangeMiles', async () => {
      // Query exactly where Jane is (Chicago)
      // Jane has a delivery radius of 5 miles. Joe is 100+ miles away.
      const { items: result, total } = await produceRepository.getList({
        lat: 41.8781,
        lng: -87.6298,
        hasDelivery: 'true',
        limit: 10,
        offset: 0,
      });

      // Joe shouldn't be here because he's too far for his 15mi delivery radius to cover Chicago.
      // Jane SHOULD be here because she is right at the location (0mi distance) which is <= 5mi radius.
      expect(total).toBe(1);
      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });
  });

  it('should retrieve a specific produce listing by ID with seller details', async () => {
    const createPayload: CreateProducePayload = {
      title: 'Heirloom Tomatoes',
      produceType: 'nightshades',
      pricePerOz: 0.3,
      totalOzInventory: 400,
      harvestFrequencyDays: 2,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/tomato.jpg'],
      isSubscribable: true,
    };

    const created = await produceRepository.create(TEST_SELLER_ID, createPayload);

    const item = await produceRepository.getById(created.id);

    expect(item).toBeDefined();
    expect(item?.id).toBe(created.id);
    expect(item?.title).toBe('Heirloom Tomatoes');
    expect(item?.produceType).toBe('nightshades');

    // Check joined seller details
    expect(item?.seller).toBeDefined();
    expect(item?.seller.id).toBe(TEST_SELLER_ID);
    expect(item?.seller.name).toBe('Farmer Joe');
    expect(item?.seller.deliveryRangeMiles).toBe(15);
    expect(item?.seller.canDeliver).toBe(true);
    expect(item?.seller.location).toStrictEqual({
      city: 'Madison',
      state: 'WI',
      country: 'USA',
      lat: null,
      lng: null,
      address: null,
      zip: null,
    });
  });

  it('should return undefined when retrieving a non-existent produce ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const item = await produceRepository.getById(fakeId);

    expect(item).toBeUndefined();
  });

  describe('getMapItems', () => {
    beforeEach(async () => {
      await testDb.insert(produce).values([
        {
          sellerId: TEST_SELLER_ID, // Madison (-89.4012, 43.0731)
          title: 'Joe Carrots',
          produceType: 'root_vegetables',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
          images: ['joe_carrot.jpg'],
        },
        {
          sellerId: OTHER_SELLER_ID, // Chicago (-87.6298, 41.8781)
          title: 'Jane Apples',
          produceType: 'stone_fruits',
          pricePerOz: '0.25',
          totalOzInventory: '500',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
          images: [],
        },
      ]);
    });

    it('should filter items by the specified radius and extract valid lat/lng geometry', async () => {
      // Query near Madison with a small radius
      const result = await produceRepository.getMapItems({
        lat: 43.0731,
        lng: -89.4012,
        radiusMiles: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[0].name).toBe('Joe Carrots');
      expect(result[0].lat).toBeCloseTo(43.0731);
      expect(result[0].lng).toBeCloseTo(-89.4012);
    });

    it('should filter out items that exceed maxPrice', async () => {
      // Query from somewhere between Madison and Chicago with huge radius
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        maxPrice: 0.5, // Joe's 1.00 carrots should be excluded
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
      expect(result[0].name).toBe('Jane Apples');
    });

    it('should filter items by specific produceType', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        produceType: 'root_vegetables', // Jane's fruit apples should be excluded
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[0].name).toBe('Joe Carrots');
    });

    it('should filter by delivery capability when hasDelivery is requested', async () => {
      // Query exactly at Chicago (Jane's location)
      const result = await produceRepository.getMapItems({
        lat: 41.8781,
        lng: -87.6298,
        radiusMiles: 500,
        hasDelivery: 'true',
      });

      // Joe shouldn't be here because his 15mi delivery doesn't reach Chicago
      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });
  });

  describe('getProduceOrders', () => {
    const BUYER_ID = 'buyer_repo_777';
    let dbProduce: any;

    beforeEach(async () => {
      await testDb.insert(users).values({
        id: BUYER_ID,
        name: 'Bulk Buyer',
        email: 'bulk@buyer.com',
      });

      const [newProduce] = await testDb
        .insert(produce)
        .values({
          sellerId: TEST_SELLER_ID,
          title: 'Giant Pumpkins',
          produceType: 'melons',
          pricePerOz: '0.05',
          totalOzInventory: '5000',
          harvestFrequencyDays: 30,
          seasonStart: '2024-09-01',
          seasonEnd: '2024-11-30',
        })
        .returning();

      dbProduce = newProduce;

      for (let i = 1; i <= 2; i++) {
        const [insertedOrder] = await testDb
          .insert(orders)
          .values({
            buyerId: BUYER_ID,
            sellerId: TEST_SELLER_ID,
            stripeSessionId: `session_${i}`,
            paymentMethod: 'card',
            fulfillmentType: 'delivery',
            scheduledTime: new Date(),
            status: i === 1 ? 'completed' : 'pending',
            totalAmount: `${i * 10}.00`,
            createdAt: new Date(Date.now() - i * 10000),
          })
          .returning();

        await testDb.insert(orderItems).values({
          orderId: insertedOrder.id,
          productId: dbProduce.id,
          quantityOz: `${i * 200}`,
          pricePerOz: '0.05',
        });
      }
    });

    it('should return orders successfully if the requester is the seller', async () => {
      const result = await produceRepository.getProduceOrders(dbProduce.id, TEST_SELLER_ID, 10, 0);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(2);
      expect(result!.items).toHaveLength(2);

      expect(result!.items[0].id).toBeDefined();
      expect(result!.items[0].status).toBeDefined();
      expect(result!.items[0].quantityOz).toBeDefined();
      expect(result!.items[0].buyer).toBeDefined();
      expect(result!.items[0].buyer.id).toBe(BUYER_ID);
      expect(result!.items[0].buyer.name).toBe('Bulk Buyer');
    });

    it('should return null if the requester is NOT the seller', async () => {
      const result = await produceRepository.getProduceOrders(dbProduce.id, OTHER_SELLER_ID, 10, 0);
      expect(result).toBeNull();
    });

    it('should paginate correctly based on limit and offset', async () => {
      const page1 = await produceRepository.getProduceOrders(dbProduce.id, TEST_SELLER_ID, 1, 0);
      expect(page1).not.toBeNull();
      expect(page1!.total).toBe(2);
      expect(page1!.items).toHaveLength(1);

      const page2 = await produceRepository.getProduceOrders(dbProduce.id, TEST_SELLER_ID, 1, 1);
      expect(page2).not.toBeNull();
      expect(page2!.total).toBe(2);
      expect(page2!.items).toHaveLength(1);

      // Ensure they are strictly different orders
      expect(page1!.items[0].id).not.toBe(page2!.items[0].id);

      const pageOutOfBounds = await produceRepository.getProduceOrders(
        dbProduce.id,
        TEST_SELLER_ID,
        10,
        50,
      );
      expect(pageOutOfBounds).not.toBeNull();
      expect(pageOutOfBounds!.total).toBe(2);
      expect(pageOutOfBounds!.items).toHaveLength(0);
    });
  });

  describe('getSellerListings', () => {
    beforeEach(async () => {
      await testDb.insert(produce).values([
        {
          sellerId: TEST_SELLER_ID,
          title: 'Test Active 1',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          sellerId: TEST_SELLER_ID,
          title: 'Test Paused 1',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'paused',
          createdAt: new Date('2024-01-02T10:00:00Z'),
        },
        {
          sellerId: OTHER_SELLER_ID,
          title: 'Other Sellers Active',
          pricePerOz: '1.00',
          totalOzInventory: '50',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          status: 'active',
          createdAt: new Date('2024-01-03T10:00:00Z'),
        },
      ]);
    });

    it('should return only the requested sellers listings, ordered by newest first', async () => {
      const { items: results, total } = await produceRepository.getSellerListings({
        sellerId: TEST_SELLER_ID,
        limit: 10,
        offset: 0,
      });

      expect(total).toBe(2);
      expect(results).toHaveLength(2);

      expect(results[0].title).toBe('Test Paused 1');
      expect(results[1].title).toBe('Test Active 1');

      expect(results.some((r) => r.sellerId !== TEST_SELLER_ID)).toBe(false);
    });

    it('should filter correctly by status', async () => {
      const { items: results, total } = await produceRepository.getSellerListings({
        sellerId: TEST_SELLER_ID,
        limit: 10,
        offset: 0,
        status: 'active',
      });

      expect(total).toBe(1);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Active 1');
      expect(results[0].status).toBe('active');
    });

    it('should paginate correctly', async () => {
      const { items: results, total } = await produceRepository.getSellerListings({
        sellerId: TEST_SELLER_ID,
        limit: 1,
        offset: 1,
      });

      expect(total).toBe(2);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Test Active 1');
    });
  });
});
