import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users, fcmTokens } from '../../../src/db/schema.js';

describe('UserRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
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

  it('should update a user and correctly format lat/lng into PostGIS location', async () => {
    await testDb.insert(users).values({
      id: 'update_user_123',
      name: 'Old Name',
      email: 'update@example.com',
      passwordHash: 'hashed_pw_123',
    });

    const updatedUser = await userRepository.updateById('update_user_123', {
      name: 'New Name',
      address: '123 Map St',
      deliveryRangeMiles: 15,
      lat: 40.7128,
      lng: -74.006,
    });

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.name).toBe('New Name');
    expect(updatedUser?.address).toBe('123 Map St');
    expect(updatedUser?.deliveryRangeMiles).toBe('15');

    const fetchedUser = await userRepository.findById('update_user_123');
    expect(fetchedUser?.location).toBeDefined();
    expect(fetchedUser?.location).not.toBeNull();
  });

  it('should insert FCM token and platform into the fcm_tokens table', async () => {
    const userId = 'repo_fcm_user';
    await testDb.insert(users).values({
      id: userId,
      email: 'repo-fcm@example.com',
      name: 'Repo User',
    });

    await userRepository.updateFcmToken(userId, 'token_abc_123', 'web');

    const insertedTokens = await testDb
      .select()
      .from(fcmTokens)
      .where(eq(fcmTokens.userId, userId));

    expect(insertedTokens).toHaveLength(1);
    expect(insertedTokens[0].token).toBe('token_abc_123');
    expect(insertedTokens[0].platform).toBe('web');
  });

  it('should upsert FCM token and update the user/platform if the token already exists', async () => {
    const userId1 = 'user_one';
    const userId2 = 'user_two';

    await testDb.insert(users).values([
      { id: userId1, email: 'user1@example.com' },
      { id: userId2, email: 'user2@example.com' },
    ]);

    await userRepository.updateFcmToken(userId1, 'shared_device_token', 'ios');

    await userRepository.updateFcmToken(userId2, 'shared_device_token', 'android');

    const tokensUser1 = await testDb.select().from(fcmTokens).where(eq(fcmTokens.userId, userId1));
    const tokensUser2 = await testDb.select().from(fcmTokens).where(eq(fcmTokens.userId, userId2));

    expect(tokensUser1).toHaveLength(0);

    expect(tokensUser2).toHaveLength(1);
    expect(tokensUser2[0].token).toBe('shared_device_token');
    expect(tokensUser2[0].platform).toBe('android');
  });

  it('should update only the internal stripe account id', async () => {
    const userId = 'stripe_update_user_123';
    await testDb.insert(users).values({
      id: userId,
      name: 'Stripe Tester',
      email: 'stripe.tester@example.com',
    });

    const updatedUser = await userRepository.updateStripeAccountId(
      userId,
      'acct_stripe_internal_456',
    );

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.stripeAccountId).toBe('acct_stripe_internal_456');

    const fetchedUser = await userRepository.findById(userId);
    expect(fetchedUser?.stripeAccountId).toBe('acct_stripe_internal_456');
  });

  it('should update the stripe onboarding completion status', async () => {
    const userId = 'stripe_onboard_user_123';
    await testDb.insert(users).values({
      id: userId,
      email: 'stripe.onboarding@example.com',
      stripeAccountId: 'acct_onboard_123',
      stripeOnboardingComplete: false,
    });

    await userRepository.updateStripeOnboardingStatus('acct_onboard_123', true);

    const fetchedUser = await userRepository.findById(userId);
    expect(fetchedUser?.stripeOnboardingComplete).toBe(true);
  });
});
