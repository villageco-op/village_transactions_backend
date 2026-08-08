import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js'; // Adjust paths as necessary
import { fcmRepository } from '../../../src/repositories/fcm.repository.js';
import { users, fcmTokens } from '../../../src/db/schema.js';

describe('FcmRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const USER_A = 'user_alpha_123';
  const USER_B = 'user_beta_456';

  beforeAll(() => {
    testDb = getTestDb();
    fcmRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: USER_A, name: 'User Alpha', email: 'alpha@example.com' },
      { id: USER_B, name: 'User Beta', email: 'beta@example.com' },
    ]);
  });

  describe('upsertToken', () => {
    it('should insert a new token record if it does not already exist', async () => {
      await fcmRepository.upsertToken(USER_A, 'token_unique_1', 'ios');

      const records = await testDb
        .select()
        .from(fcmTokens)
        .where(eq(fcmTokens.token, 'token_unique_1'));

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        userId: USER_A,
        token: 'token_unique_1',
        platform: 'ios',
      });
    });

    it('should reassign user ownership and platform when a token conflicts (upsert logic)', async () => {
      await testDb.insert(fcmTokens).values({
        userId: USER_A,
        token: 'token_shared_device',
        platform: 'android',
      });

      await fcmRepository.upsertToken(USER_B, 'token_shared_device', 'web');

      const records = await testDb
        .select()
        .from(fcmTokens)
        .where(eq(fcmTokens.token, 'token_shared_device'));

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        userId: USER_B,
        token: 'token_shared_device',
        platform: 'web',
      });
    });
  });

  describe('getTokensByUserId', () => {
    it('should fetch all registered tokens specific only to the requested user', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: USER_A, token: 'token_a_1', platform: 'ios' },
        { userId: USER_A, token: 'token_a_2', platform: 'web' },
        { userId: USER_B, token: 'token_b_1', platform: 'android' },
      ]);

      const result = await fcmRepository.getTokensByUserId(USER_A);

      expect(result).toHaveLength(2);
      const tokens = result.map((r: any) => r.token);
      expect(tokens).toContain('token_a_1');
      expect(tokens).toContain('token_a_2');
      expect(tokens).not.toContain('token_b_1');
    });
  });

  describe('getTokensByPlatform', () => {
    it('should safely isolate tokens filtering by both user ID and target platform', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: USER_A, token: 'token_a_ios', platform: 'ios' },
        { userId: USER_A, token: 'token_a_web', platform: 'web' },
        { userId: USER_B, token: 'token_b_ios', platform: 'ios' },
      ]);

      const result = await fcmRepository.getTokensByPlatform(USER_A, 'ios');

      expect(result).toHaveLength(1);
      expect(result[0].token).toBe('token_a_ios');
    });
  });

  describe('deleteTokens', () => {
    it('should drop multiple targeted stale tokens at once from an array', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: USER_A, token: 'purge_1', platform: 'ios' },
        { userId: USER_A, token: 'purge_2', platform: 'android' },
        { userId: USER_A, token: 'keep_me', platform: 'web' },
      ]);

      await fcmRepository.deleteTokens(['purge_1', 'purge_2', 'non_existent_token']);

      const remaining = await testDb.select().from(fcmTokens);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].token).toBe('keep_me');
    });

    it('should short-circuit and make zero database evaluations if an empty token list is given', async () => {
      await expect(fcmRepository.deleteTokens([])).resolves.not.toThrow();
    });
  });

  describe('deleteByUserId', () => {
    it('should drop all associated tokens for a targeted user, while ignoring others', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: USER_A, token: 'token_1', platform: 'ios' },
        { userId: USER_A, token: 'token_2', platform: 'web' },
        { userId: USER_B, token: 'token_3', platform: 'android' },
      ]);

      await fcmRepository.deleteByUserId(USER_A);

      const userATokens = await testDb.select().from(fcmTokens).where(eq(fcmTokens.userId, USER_A));
      const userBTokens = await testDb.select().from(fcmTokens).where(eq(fcmTokens.userId, USER_B));

      expect(userATokens).toHaveLength(0);
      expect(userBTokens).toHaveLength(1);
    });
  });

  describe('deleteByPlatform', () => {
    it('should wipe records limited exactly to the chosen profile and platform combo', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: USER_A, token: 'ios_clear', platform: 'ios' },
        { userId: USER_A, token: 'web_save', platform: 'web' },
        { userId: USER_B, token: 'ios_save', platform: 'ios' },
      ]);

      await fcmRepository.deleteByPlatform(USER_A, 'ios');

      const remaining = await testDb.select().from(fcmTokens);
      expect(remaining).toHaveLength(2);

      const tokens = remaining.map((r: any) => r.token);
      expect(tokens).toContain('web_save');
      expect(tokens).toContain('ios_save');
      expect(tokens).not.toContain('ios_clear');
    });
  });
});
