import { describe, it, expect, beforeEach } from 'vitest';

import * as schema from '../../../src/db/schema';
import { userRepository } from '../../../src/repositories/user.repository';
import { DbClient } from '../../../src/db/types';
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

  it('should update user profile fields using updateById', async () => {
    const newUser = {
      id: 'user_update_123',
      name: 'Old Name',
      email: 'update@example.com',
      passwordHash: 'secure_hash',
      address: 'Old Address',
      deliveryRangeMiles: '5',
    };

    await userRepository.db.insert(schema.users).values(newUser);

    const updatedUser = await userRepository.updateById('user_update_123', {
      name: 'New Name',
      address: 'New Address',
      deliveryRangeMiles: 15,
    });

    expect(updatedUser).toMatchObject({
      id: 'user_update_123',
      name: 'New Name',
      address: 'New Address',
      deliveryRangeMiles: '15',
    });

    const verifiedUser = await userRepository.findById('user_update_123');
    expect(verifiedUser?.name).toBe('New Name');
  });

  it('should update user fcmToken and fcmPlatform using updateFcmToken', async () => {
    const newUser = {
      id: 'user_fcm_123',
      name: 'Push User',
      email: 'push@example.com',
      passwordHash: 'secure_hash',
    };

    await userRepository.db.insert(schema.users).values(newUser);

    await userRepository.updateFcmToken('user_fcm_123', 'mock_firebase_token_xyz', 'ios');

    const verifiedUser = await userRepository.findById('user_fcm_123');

    expect(verifiedUser).toMatchObject({
      id: 'user_fcm_123',
      fcmToken: 'mock_firebase_token_xyz',
      fcmPlatform: 'ios',
    });
  });
});
