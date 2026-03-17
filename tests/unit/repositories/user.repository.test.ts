import { describe, it, expect, beforeEach } from 'vitest';

import * as schema from '../../../src/db/schema';
import { userRepository } from '../../../src/repositories/user.repository';
import { DbClient, User } from '../../../src/db/types';
import { createTestDb } from '../../test-utils/libsql-db';

describe('UserRepository - Automated Migrations', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    userRepository.setDb(db as unknown as DbClient);
  });

  it('should save and retrieve a user using the real schema', async () => {
    const newUser = {
      id: 'user_abc_123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      emailVerified: new Date(),
      image: null,
      passwordHash: 'secure_hash',
      address: '123 Market St',
      location: null,
      deliveryRangeMiles: '25.5',
      stripeAccountId: 'acct_123456',
      stripeOnboardingComplete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await userRepository.db.insert(schema.users).values(newUser);

    const result = await userRepository.findByEmail('jane@example.com');

    expect(result).toMatchObject({
      id: 'user_abc_123',
      email: 'jane@example.com',
      stripeAccountId: 'acct_123456',
      deliveryRangeMiles: '25.5',
    });
  });

  it('should save and retrieve a user by ID', async () => {
    const newUser = {
      id: 'user_xyz_789',
      name: 'John Smith',
      email: 'john@example.com',
      passwordHash: 'secure_hash',
    };

    await userRepository.db.insert(schema.users).values(newUser);

    const result = await userRepository.findById('user_xyz_789');

    expect(result).toMatchObject({
      id: 'user_xyz_789',
      name: 'John Smith',
      email: 'john@example.com',
    });
  });
});
