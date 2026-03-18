import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, closeTestDb, truncateTables } from '../../test-utils/testcontainer-db.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { users } from '../../../src/db/schema.js';

describe('ProduceRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_SELLER_ID = 'seller_repo_123';

  beforeAll(async () => {
    testDb = await createTestDb();
    produceRepository.setDb(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    // Insert a dummy user to satisfy the seller_id foreign key constraint on the produce table
    await testDb.insert(users).values({
      id: TEST_SELLER_ID,
      name: 'Farmer Joe',
      email: 'joe@farm.com',
      passwordHash: 'hashed_pw',
    });
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
});
