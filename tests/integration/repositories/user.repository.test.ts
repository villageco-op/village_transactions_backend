import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, closeTestDb, truncateTables } from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users } from '../../../src/db/schema.js';

describe('UserRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(async () => {
    testDb = await createTestDb();

    userRepository.setDb(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  it('should save and find a user by email', async () => {
    await testDb.insert(users).values({
      id: 'test_id',
      name: 'Integration Tester',
      email: 'integration@example.com',
      passwordHash: 'hashed_pw_123',
    });

    const user = await userRepository.findByEmail('integration@example.com');

    expect(user).toBeDefined();
    expect(user?.name).toBe('Integration Tester');
    expect(user?.email).toBe('integration@example.com');
  });

  it('should return null for non-existent email', async () => {
    const user = await userRepository.findByEmail('nobody@example.com');
    expect(user).toBeNull();
  });

  it('should save and find a user by ID including extended schema fields', async () => {
    await testDb.insert(users).values({
      id: 'seller_123',
      name: 'Marketplace Seller',
      email: 'seller@example.com',
      passwordHash: 'hashed_pw_456',
      address: '789 Commerce Way',
      deliveryRangeMiles: '50.5',
      stripeAccountId: 'acct_123abc',
      stripeOnboardingComplete: true,
    });

    const user = await userRepository.findById('seller_123');

    expect(user).toBeDefined();
    expect(user?.id).toBe('seller_123');
    expect(user?.address).toBe('789 Commerce Way');
    expect(user?.deliveryRangeMiles).toBe('50.5'); // Numeric types return as string
    expect(user?.stripeAccountId).toBe('acct_123abc');
    expect(user?.stripeOnboardingComplete).toBe(true);
  });

  it('should return null for non-existent ID', async () => {
    const user = await userRepository.findById('missing_id_999');
    expect(user).toBeNull();
  });
});
