import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import { request } from '../../test-utils/request.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { fcmRepository } from '../../../src/repositories/fcm.repository.js';
import { users, fcmTokens } from '../../../src/db/schema.js';

describe('Users FCM API - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'test_auth_user_123';

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

    await testDb.insert(users).values({
      id: TEST_USER_ID,
      email: 'fcm.tester@example.com',
      name: 'FCM Tester',
    });
  });

  describe('POST /api/users/fcm-token', () => {
    it('should return 401 Unauthorized if the request is unauthenticated', async () => {
      const res = await request('/api/users/fcm-token', {
        method: 'POST',
        body: JSON.stringify({ token: 'tok_123', platform: 'ios' }),
      });

      expect(res.status).toBe(401);
    });

    it('should register a new token for the authenticated user and return 200', async () => {
      const payload = { token: 'token_fresh_123', platform: 'web' };

      const res = await authedRequest(
        '/api/users/fcm-token',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const dbRecords = await testDb
        .select()
        .from(fcmTokens)
        .where(eq(fcmTokens.userId, TEST_USER_ID));

      expect(dbRecords).toHaveLength(1);
      expect(dbRecords[0]).toMatchObject({
        token: 'token_fresh_123',
        platform: 'web',
      });
    });
  });

  describe('DELETE /api/users/fcm-token', () => {
    it('should return 401 Unauthorized if the request is unauthenticated', async () => {
      const res = await request('/api/users/fcm-token', {
        method: 'DELETE',
        body: JSON.stringify({ platform: 'android' }),
      });

      expect(res.status).toBe(401);
    });

    it('should drop all registration tokens for the user matching the targeted platform', async () => {
      await testDb.insert(fcmTokens).values([
        { userId: TEST_USER_ID, token: 'delete_me_1', platform: 'android' },
        { userId: TEST_USER_ID, token: 'delete_me_2', platform: 'android' },
        { userId: TEST_USER_ID, token: 'keep_me', platform: 'ios' },
      ]);

      const res = await authedRequest(
        '/api/users/fcm-token',
        {
          method: 'DELETE',
          body: JSON.stringify({ platform: 'android' }),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const remainingTokens = await testDb
        .select()
        .from(fcmTokens)
        .where(eq(fcmTokens.userId, TEST_USER_ID));

      expect(remainingTokens).toHaveLength(1);
      expect(remainingTokens[0].token).toBe('keep_me');
    });
  });

  describe('GET /api/users/fcm-status', () => {
    it('should return 401 Unauthorized if the request is unauthenticated', async () => {
      const res = await request('/api/users/fcm-status?platform=ios');

      expect(res.status).toBe(401);
    });

    it('should return status: true if matching active tokens are found for the platform', async () => {
      await testDb.insert(fcmTokens).values({
        userId: TEST_USER_ID,
        token: 'active_token',
        platform: 'ios',
      });

      const res = await authedRequest(
        '/api/users/fcm-status?platform=ios',
        {},
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: true });
    });

    it('should return status: false if no active tokens exist for the platform', async () => {
      const res = await authedRequest(
        '/api/users/fcm-status?platform=web',
        {},
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: false });
    });
  });
});
