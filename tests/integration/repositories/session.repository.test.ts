import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { sessionRepository } from '../../../src/repositories/session.repository.js';
import { users, sessions } from '../../../src/db/schema.js';

describe('SessionRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TARGET_USER_ID = 'user_kill_sessions_123';
  const OTHER_USER_ID = 'user_keep_sessions_456';

  beforeAll(() => {
    testDb = getTestDb();
    sessionRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: TARGET_USER_ID, name: 'Target User', email: 'target.sessions@example.com' },
      { id: OTHER_USER_ID, name: 'Other User', email: 'other.sessions@example.com' },
    ]);
  });

  describe('deleteByUserId', () => {
    it('should delete all sessions for the target user, forcing a logout across devices', async () => {
      const expiryDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour out

      await testDb.insert(sessions).values([
        {
          sessionToken: 'token_desktop_111',
          userId: TARGET_USER_ID,
          expires: expiryDate,
        },
        {
          sessionToken: 'token_mobile_222',
          userId: TARGET_USER_ID,
          expires: expiryDate,
        },
        {
          sessionToken: 'token_other_user_333',
          userId: OTHER_USER_ID,
          expires: expiryDate,
        },
      ]);

      await sessionRepository.deleteByUserId(TARGET_USER_ID);

      const targetSessions = await testDb
        .select()
        .from(sessions)
        .where(eq(sessions.userId, TARGET_USER_ID));
      expect(targetSessions).toHaveLength(0);

      const otherSessions = await testDb
        .select()
        .from(sessions)
        .where(eq(sessions.userId, OTHER_USER_ID));
      expect(otherSessions).toHaveLength(1);
      expect(otherSessions[0].sessionToken).toBe('token_other_user_333');
    });

    it('should complete successfully if the user has zero active sessions', async () => {
      await expect(sessionRepository.deleteByUserId(TARGET_USER_ID)).resolves.not.toThrow();
    });
  });
});
