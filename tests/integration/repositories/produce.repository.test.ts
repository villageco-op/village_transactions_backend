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
  const INCOMPLETE_SELLER_ID = 'seller_repo_incomplete';

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
        location: sql`ST_SetSRID(ST_MakePoint(-89.4012, 43.0731), 4326)`,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
        deliveryRangeMiles: '15',
        stripeOnboardingComplete: true,
      },
      {
        id: OTHER_SELLER_ID,
        name: 'Farmer Jane',
        email: 'jane@farm.com',
        location: sql`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`,
        deliveryRangeMiles: '5',
        stripeOnboardingComplete: true,
      },
      {
        id: INCOMPLETE_SELLER_ID,
        name: 'Farmer Bob',
        email: 'bob@farm.com',
        location: sql`ST_SetSRID(ST_MakePoint(-89.4012, 43.0731), 4326)`,
        deliveryRangeMiles: '15',
        stripeOnboardingComplete: false,
      },
    ]);
  });

  it('should create and retrieve a produce listing successfully', async () => {
    const payload: CreateProducePayload = {
      title: 'Fresh Strawberries',
      produceType: 'berries',
      pricePerOz: 1.25,
      totalOzInventory: 500,
      maxOrderQuantityOz: 32,
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
    expect(newProduce.maxOrderQuantityOz).toBe('32.00');

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
      maxOrderQuantityOz: 100,
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
      maxOrderQuantityOz: null,
    };

    const updated = await produceRepository.update(created.id, TEST_SELLER_ID, updatePayload);

    expect(updated).toBeDefined();
    expect(updated?.id).toBe(created.id);
    expect(updated?.status).toBe('paused');
    expect(updated?.pricePerOz).toBe('0.15');
    expect(updated?.totalOzInventory).toBe('800.00');
    expect(updated?.maxOrderQuantityOz).toBeNull();
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
          maxOrderQuantityOz: '10',
          isSubscribable: true,
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          availableBy: new Date('2024-04-15T10:00:00Z'), // Spring
          status: 'active',
        },
        {
          sellerId: OTHER_SELLER_ID,
          title: 'Jane Carrots (Cheap, Far)',
          produceType: 'root_vegetables',
          pricePerOz: '0.25',
          totalOzInventory: '500',
          maxOrderQuantityOz: null, // No limit
          isSubscribable: false,
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          availableBy: new Date('2024-07-15T10:00:00Z'), // Summer
          status: 'active',
        },
        {
          sellerId: INCOMPLETE_SELLER_ID,
          title: 'Bob Carrots (Hidden)',
          produceType: 'root_vegetables',
          pricePerOz: '0.50',
          totalOzInventory: '100',
          harvestFrequencyDays: 3,
          seasonStart: '2024-01-01',
          seasonEnd: '2024-12-31',
          availableBy: new Date(),
          status: 'active',
        },
      ]);
    });

    it('should sort by spatial distance by default and exclude non-onboarded sellers', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
      });

      // Bob is excluded because stripeOnboardingComplete = false
      expect(total).toBe(2);
      expect(result).toHaveLength(2);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[1].sellerId).toBe(OTHER_SELLER_ID);
      expect(Number(result[0].distance)).toBeLessThan(Number(result[1].distance));
    });

    it('should sort by price when requested', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        sortBy: 'price',
        limit: 10,
        offset: 0,
      });

      expect(total).toBe(2);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID); // Jane is 0.25
      expect(result[1].sellerId).toBe(TEST_SELLER_ID); // Joe is 1.00
    });

    it('should filter by string search (title, seller name)', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        search: 'Jane', // matches sellerName
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });

    it('should filter by maxOrderQuantity (returns items that allow at least this much)', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        maxOrderQuantity: 20, // Joe only allows 10, Jane allows unlimited (null)
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });

    it('should filter by isSubscribable', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        isSubscribable: 'true',
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by availableInventory', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        availableInventory: 100, // Joe only has 50
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });

    it('should filter by season', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        season: 'spring', // Joe is April (Spring), Jane is July (Summer)
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by price range', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        minPrice: 0.5,
        maxPrice: 2.0,
      });

      // Only Joe is >= 0.50
      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by maxDistance', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        maxDistance: 50, // Jane in Chicago is > 100 miles away from Madison coordinates
      });

      expect(total).toBe(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
    });

    it('should filter by sellerId', async () => {
      const { items: result, total } = await produceRepository.getList({
        lat: 43.0,
        lng: -89.4,
        limit: 10,
        offset: 0,
        sellerId: TEST_SELLER_ID,
      });

      expect(total).toBe(1);
      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[0].name).toContain('Joe Carrots');
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
          maxOrderQuantityOz: '10',
          harvestFrequencyDays: 3,
          availableBy: new Date('2024-05-10T10:00:00Z'), // Spring
          seasonStart: '2024-03-01',
          seasonEnd: '2024-05-31',
          status: 'active',
          images: ['joe_carrot.jpg'],
          isSubscribable: true,
        },
        {
          sellerId: OTHER_SELLER_ID, // Chicago (-87.6298, 41.8781)
          title: 'Jane Apples',
          produceType: 'stone_fruits',
          pricePerOz: '0.25',
          totalOzInventory: '500',
          maxOrderQuantityOz: null, // no limit
          harvestFrequencyDays: 3,
          availableBy: new Date('2024-10-15T10:00:00Z'), // Fall
          seasonStart: '2024-09-01',
          seasonEnd: '2024-11-30',
          status: 'active',
          images: [],
          isSubscribable: false,
        },
      ]);
    });

    it('should filter items by radius and return extra fields (price, inventory, etc.)', async () => {
      const result = await produceRepository.getMapItems({
        lat: 43.0731,
        lng: -89.4012,
        radiusMiles: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[0].sellerName).toBe('Farmer Joe');
      expect(result[0].name).toBe('Joe Carrots');
      expect(result[0].lat).toBeCloseTo(43.0731);
      expect(result[0].lng).toBeCloseTo(-89.4012);

      expect(result[0]).toHaveProperty('price');
      expect(result[0]).toHaveProperty('availableInventory');
      expect(result[0]).toHaveProperty('availableBy');
      expect(result[0]).toHaveProperty('seasonStart');
      expect(result[0]).toHaveProperty('seasonEnd');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('isSubscribable', true);
    });

    it('should filter items by minPrice and maxPrice simultaneously', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        minPrice: 0.5, // Jane is 0.25
        maxPrice: 1.5, // Joe is 1.00
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(TEST_SELLER_ID);
      expect(result[0].name).toBe('Joe Carrots');
    });

    it('should filter items by specific produceType', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        produceType: 'root_vegetables',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Joe Carrots');
    });

    it('should filter items by text search (matches seller name)', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        search: 'Jane',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jane Apples');
    });

    it('should filter items by maxOrderQuantity', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        maxOrderQuantity: 50, // Joe only allows up to 10
      });

      // Jane has no limit (null), so she should be included
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jane Apples');
    });

    it('should filter items by isSubscribable', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        isSubscribable: 'true',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Joe Carrots');
    });

    it('should filter items by availableInventory', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        availableInventory: 100, // Joe only has 50
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jane Apples');
    });

    it('should filter items by season', async () => {
      const result = await produceRepository.getMapItems({
        lat: 42.0,
        lng: -88.0,
        radiusMiles: 500,
        season: 'spring', // Joe's availableBy is in May
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Joe Carrots');
    });

    it('should filter by delivery capability when hasDelivery is requested', async () => {
      const result = await produceRepository.getMapItems({
        lat: 41.8781,
        lng: -87.6298,
        radiusMiles: 500,
        hasDelivery: 'true',
      });

      expect(result).toHaveLength(1);
      expect(result[0].sellerId).toBe(OTHER_SELLER_ID);
    });

    it('should exclude sellers whose stripe onboarding is incomplete', async () => {
      await testDb.insert(produce).values({
        sellerId: INCOMPLETE_SELLER_ID,
        title: 'Bob Beets',
        produceType: 'root_vegetables',
        pricePerOz: '1.00',
        totalOzInventory: '50',
        harvestFrequencyDays: 3,
        seasonStart: '2024-01-01',
        seasonEnd: '2024-12-31',
        status: 'active',
      });

      const result = await produceRepository.getMapItems({
        lat: 43.0731,
        lng: -89.4012,
        radiusMiles: 10,
      });

      // Bob's location matches Madison, but Stripe is incomplete
      const bobItems = result.filter((r: any) => r.sellerId === INCOMPLETE_SELLER_ID);
      expect(bobItems).toHaveLength(0);
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
