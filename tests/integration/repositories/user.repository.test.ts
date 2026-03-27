import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb, closeTestDb, truncateTables } from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users } from '../../../src/db/schema.js';

describe('UserRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(async () => {
    // Spin up container and run migrations once per file
    testDb = await createTestDb();

    // Inject the test DB into the repository
    userRepository.setDb(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    // Clean the database before every single test
    await truncateTables(testDb);
  });

  it('should save and find a user by email', async () => {
    // Arrange: Insert real data into the real DB
    await testDb.insert(users).values({
      id: 'test_id',
      name: 'Integration Tester',
      email: 'integration@example.com',
      passwordHash: 'hashed_pw_123',
    });

    // Act: Call the repository function
    const user = await userRepository.findByEmail('integration@example.com');

    // Assert: Verify Drizzle actually fetched the correct schema
    expect(user).toBeDefined();
    expect(user?.name).toBe('Integration Tester');
    expect(user?.email).toBe('integration@example.com');
  });

  it('should return null for non-existent email', async () => {
    const user = await userRepository.findByEmail('nobody@example.com');
    expect(user).toBeNull();
  });
});
