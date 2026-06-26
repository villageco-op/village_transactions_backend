import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users, fcmTokens } from '../../../src/db/schema.js';
import { fcmRepository } from '../../../src/repositories/fcm.repository.js';

describe('UserRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
    fcmRepository.setDb(testDb);
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
      aboutMe: 'I am a passionate local farmer.',
      specialties: ['tomatoes', 'carrots', 'corn'],
      goal: '500.00',
      address: '789 Commerce Way',
      deliveryRangeMiles: '50.5',
      stripeAccountId: 'acct_123abc',
      stripeOnboardingComplete: true,
    });

    const user = await userRepository.findById('seller_123');

    expect(user).toBeDefined();
    expect(user?.id).toBe('seller_123');
    expect(user?.aboutMe).toBe('I am a passionate local farmer.');
    expect(user?.specialties).toEqual(['tomatoes', 'carrots', 'corn']);
    expect(user?.goal).toBe('500.00');
    expect(user?.address).toBe('789 Commerce Way');
    expect(user?.deliveryRangeMiles).toBe('50.5');
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
    });

    const updatedUser = await userRepository.updateById('update_user_123', {
      name: 'New Name',
      aboutMe: 'Updated bio',
      specialties: ['apples', 'peaches'],
      goal: 1000,
      address: '123 Map St',
      city: 'Houston',
      deliveryRangeMiles: 15,
      lat: 40.7128,
      lng: -74.006,
      state: 'TX',
      country: 'USA',
      zip: '94949',
    });

    expect(updatedUser).toBeDefined();
    expect(updatedUser?.name).toBe('New Name');
    expect(updatedUser?.aboutMe).toBe('Updated bio');
    expect(updatedUser?.specialties).toEqual(['apples', 'peaches']);
    expect(updatedUser?.goal).toBe('1000.00');
    expect(updatedUser?.address).toBe('123 Map St');
    expect(updatedUser?.deliveryRangeMiles).toBe('15');
    expect(updatedUser?.state).toBe('TX');
    expect(updatedUser?.country).toBe('USA');
    expect(updatedUser?.zip).toBe('94949');

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

    await fcmRepository.upsertToken(userId, 'token_abc_123', 'web');

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

    await fcmRepository.upsertToken(userId1, 'shared_device_token', 'ios');

    await fcmRepository.upsertToken(userId2, 'shared_device_token', 'android');

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

  describe('anonymize', () => {
    it('should overwrite all PII fields with anonymous placeholders and clear metadata for the target user', async () => {
      const TARGET_USER_ID = 'user_to_anonymize_999';

      await testDb.insert(users).values({
        id: TARGET_USER_ID,
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        emailVerified: new Date('2025-01-01'),
        image: 'https://example.com/avatar.jpg',
        orgRole: 'member',
        aboutMe: 'Local grower since 2010.',
        specialties: ['organic-berries', 'honey'],
        goal: '1500.00',
        address: '123 Homestead Lane',
        city: 'Madison',
        state: 'WI',
        country: 'US',
        zip: '53703',
        lat: 43.0731,
        lng: -89.4012,
        location: sql`ST_SetSRID(ST_MakePoint(-89.4012, 43.0731), 4326)`,
        deliveryRangeMiles: '25.0',
        stripeAccountId: 'acct_target_stripe_789',
        stripeOnboardingComplete: true,
        updatedAt: new Date('2025-01-01'),
      });

      await userRepository.anonymize(TARGET_USER_ID);

      const updatedUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, TARGET_USER_ID))
        .then((res: any[]) => res[0]);

      expect(updatedUser).toBeDefined();

      expect(updatedUser.name).toBe('Deleted User');
      expect(updatedUser.email).toBe(`deleted-${TARGET_USER_ID}@example.local`);
      expect(updatedUser.deliveryRangeMiles).toBe('0');
      expect(updatedUser.stripeOnboardingComplete).toBe(false);

      expect(updatedUser.emailVerified).toBeNull();
      expect(updatedUser.image).toBeNull();
      expect(updatedUser.organizationId).toBeNull();
      expect(updatedUser.orgRole).toBeNull();
      expect(updatedUser.aboutMe).toBeNull();
      expect(updatedUser.specialties).toEqual([]);
      expect(updatedUser.goal).toBeNull();
      expect(updatedUser.address).toBeNull();
      expect(updatedUser.city).toBeNull();
      expect(updatedUser.state).toBeNull();
      expect(updatedUser.country).toBeNull();
      expect(updatedUser.zip).toBeNull();
      expect(updatedUser.lat).toBeNull();
      expect(updatedUser.lng).toBeNull();
      expect(updatedUser.location).toBeNull();
      expect(updatedUser.stripeAccountId).toBeNull();

      expect(new Date(updatedUser.updatedAt).getTime()).toBeGreaterThan(
        new Date('2025-01-01').getTime(),
      );
    });

    it('should isolate changes and not affect other users in the system', async () => {
      const TARGET_USER_ID = 'delete_me_888';
      const BACKUP_USER_ID = 'keep_me_safe_777';

      await testDb.insert(users).values([
        {
          id: TARGET_USER_ID,
          name: 'Target User',
          email: 'target@example.com',
        },
        {
          id: BACKUP_USER_ID,
          name: 'Safe User',
          email: 'safe@example.com',
          stripeOnboardingComplete: true,
        },
      ]);

      await userRepository.anonymize(TARGET_USER_ID);

      const safeUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, BACKUP_USER_ID))
        .then((res: any[]) => res[0]);

      expect(safeUser.name).toBe('Safe User');
      expect(safeUser.email).toBe('safe@example.com');
      expect(safeUser.stripeOnboardingComplete).toBe(true);
    });
  });

  describe('updateOrgAndRole', () => {
    it('should successfully associate a user with an organization and update their role', async () => {
      const USER_ID = 'test_user_123';
      const ORG_ID = crypto.randomUUID();
      const ROLE = 'admin';

      await testDb.insert(users).values({
        id: USER_ID,
        name: 'John Doe',
        email: 'john.doe@example.com',
        organizationId: null,
        orgRole: null,
      });

      const updatedUser = await userRepository.updateOrgAndRole(USER_ID, ORG_ID, ROLE);

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.id).toBe(USER_ID);
      expect(updatedUser?.organizationId).toBe(ORG_ID);
      expect(updatedUser?.orgRole).toBe(ROLE);

      const dbUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, USER_ID))
        .then((res: any[]) => res[0]);

      expect(dbUser.organizationId).toBe(ORG_ID);
      expect(dbUser.orgRole).toBe(ROLE);
    });

    it('should return null if the target user does not exist', async () => {
      const NON_EXISTENT_USER_ID = 'ghost_user_404';
      const ORG_ID = crypto.randomUUID();

      const result = await userRepository.updateOrgAndRole(NON_EXISTENT_USER_ID, ORG_ID, 'member');

      expect(result).toBeNull();
    });

    it('should only update the targeted user and leave others untouched', async () => {
      const TARGET_USER_ID = 'target_user';
      const OTHER_USER_ID = 'other_user';
      const ORG_ID = crypto.randomUUID();

      await testDb.insert(users).values([
        {
          id: TARGET_USER_ID,
          name: 'Target',
          email: 'target@example.com',
          organizationId: null,
          orgRole: null,
        },
        {
          id: OTHER_USER_ID,
          name: 'Untouched',
          email: 'untouched@example.com',
          organizationId: ORG_ID,
          orgRole: 'admin',
        },
      ]);

      await userRepository.updateOrgAndRole(TARGET_USER_ID, ORG_ID, 'member');

      const otherUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, OTHER_USER_ID))
        .then((res: any[]) => res[0]);

      expect(otherUser.organizationId).toBe(ORG_ID);
      expect(otherUser.orgRole).toBe('admin');
    });
  });

  describe('clearOrganizationFromUsers', () => {
    it('should nullify organizationId and orgRole for all users in the target organization', async () => {
      const TARGET_ORG_ID = crypto.randomUUID();
      const USER_1_ID = 'user_one';
      const USER_2_ID = 'user_two';

      await testDb.insert(users).values([
        {
          id: USER_1_ID,
          name: 'Alice Smith',
          email: 'alice@example.com',
          organizationId: TARGET_ORG_ID,
          orgRole: 'admin',
        },
        {
          id: USER_2_ID,
          name: 'Bob Jones',
          email: 'bob@example.com',
          organizationId: TARGET_ORG_ID,
          orgRole: 'member',
        },
      ]);

      await userRepository.clearOrganizationFromUsers(TARGET_ORG_ID);

      const updatedUsers = await testDb
        .select()
        .from(users)
        .where(sql`${users.id} IN (${USER_1_ID}, ${USER_2_ID})`);

      expect(updatedUsers).toHaveLength(2);
      for (const user of updatedUsers) {
        expect(user.organizationId).toBeNull();
        expect(user.orgRole).toBeNull();
      }
    });

    it('should only clear targeted organization users and leave other organizations untouched', async () => {
      const TARGET_ORG_ID = crypto.randomUUID();
      const OTHER_ORG_ID = crypto.randomUUID();
      const TARGET_USER_ID = 'target_org_user';
      const OTHER_USER_ID = 'other_org_user';

      await testDb.insert(users).values([
        {
          id: TARGET_USER_ID,
          name: 'Target Org User',
          email: 'target_org@example.com',
          organizationId: TARGET_ORG_ID,
          orgRole: 'member',
        },
        {
          id: OTHER_USER_ID,
          name: 'Other Org User',
          email: 'other_org@example.com',
          organizationId: OTHER_ORG_ID,
          orgRole: 'admin',
        },
      ]);

      await userRepository.clearOrganizationFromUsers(TARGET_ORG_ID);

      const targetUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, TARGET_USER_ID))
        .then((res: any[]) => res[0]);

      expect(targetUser.organizationId).toBeNull();
      expect(targetUser.orgRole).toBeNull();

      const otherUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, OTHER_USER_ID))
        .then((res: any[]) => res[0]);

      expect(otherUser.organizationId).toBe(OTHER_ORG_ID);
      expect(otherUser.orgRole).toBe('admin');
    });

    it('should resolve successfully and do nothing if no users belong to the organization', async () => {
      const EMPTY_ORG_ID = crypto.randomUUID();
      const ACTIVE_ORG_ID = crypto.randomUUID();
      const EXISTING_USER_ID = 'existing_user';

      await testDb.insert(users).values({
        id: EXISTING_USER_ID,
        name: 'John Wayne',
        email: 'john.wayne@example.com',
        organizationId: ACTIVE_ORG_ID,
        orgRole: 'member',
      });

      await expect(userRepository.clearOrganizationFromUsers(EMPTY_ORG_ID)).resolves.not.toThrow();

      const dbUser = await testDb
        .select()
        .from(users)
        .where(eq(users.id, EXISTING_USER_ID))
        .then((res: any[]) => res[0]);

      expect(dbUser.organizationId).toBe(ACTIVE_ORG_ID);
      expect(dbUser.orgRole).toBe('member');
    });
  });
});
