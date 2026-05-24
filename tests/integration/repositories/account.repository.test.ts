import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { accountRepository } from '../../../src/repositories/account.repository.js';
import { users, accounts } from '../../../src/db/schema.js';

describe('AccountRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TARGET_USER_ID = 'user_delete_accounts_123';
  const OTHER_USER_ID = 'user_keep_accounts_456';

  beforeAll(() => {
    testDb = getTestDb();
    accountRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: TARGET_USER_ID, name: 'Target User', email: 'target@example.com' },
      { id: OTHER_USER_ID, name: 'Other User', email: 'other@example.com' },
    ]);
  });

  describe('deleteByUserId', () => {
    it('should remove all linked OAuth accounts for the target user while leaving others untouched', async () => {
      await testDb.insert(accounts).values([
        {
          userId: TARGET_USER_ID,
          type: 'oauth',
          provider: 'google',
          providerAccountId: 'google-idx-111',
        },
        {
          userId: TARGET_USER_ID,
          type: 'oauth',
          provider: 'github',
          providerAccountId: 'github-idx-222',
        },
        {
          userId: OTHER_USER_ID,
          type: 'oauth',
          provider: 'google',
          providerAccountId: 'google-idx-333',
        },
      ]);

      await accountRepository.deleteByUserId(TARGET_USER_ID);

      const targetAccounts = await testDb
        .select()
        .from(accounts)
        .where(eq(accounts.userId, TARGET_USER_ID));
      expect(targetAccounts).toHaveLength(0);

      const otherAccounts = await testDb
        .select()
        .from(accounts)
        .where(eq(accounts.userId, OTHER_USER_ID));
      expect(otherAccounts).toHaveLength(1);
      expect(otherAccounts[0].providerAccountId).toBe('google-idx-333');
    });

    it('should complete successfully if the user has no linked accounts', async () => {
      await expect(accountRepository.deleteByUserId(TARGET_USER_ID)).resolves.not.toThrow();
    });
  });
});
