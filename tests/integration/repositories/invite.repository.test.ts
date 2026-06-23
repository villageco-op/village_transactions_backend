import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { inviteRepository } from '../../../src/repositories/invite.repository.js';
import { invites, organizations } from '../../../src/db/schema.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';

describe('InviteRepository - Integration', { timeout: 120_000 }, () => {
  let testDb: any;
  let defaultOrgId: string;
  const MOCK_SYSTEM_TIME = new Date('2020-06-23T12:00:00Z');

  beforeAll(() => {
    testDb = getTestDb();
    inviteRepository.setDb(testDb);
    organizationRepository.setDb(testDb);
    vi.useFakeTimers();
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(MOCK_SYSTEM_TIME);

    await truncateTables(testDb);

    const uniqueSubdomain = `test-org-${Math.random().toString(36).substring(2, 7)}`;

    const [org] = await testDb
      .insert(organizations)
      .values({
        name: 'Test Organization',
        type: 'pantry',
        subdomain: uniqueSubdomain,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      })
      .returning();

    defaultOrgId = org.id;
  });

  describe('findById', () => {
    it('should return null if the invite does not exist', async () => {
      const nonExistentInviteId = crypto.randomUUID();
      const result = await inviteRepository.findById(nonExistentInviteId);
      expect(result).toBeNull();
    });

    it('should retrieve the correct invite record by its ID', async () => {
      const inviteId = crypto.randomUUID();
      const inviteData = {
        id: inviteId,
        email: 'user@example.com',
        orgId: defaultOrgId,
        code: 'SECRET123',
        role: 'admin' as const,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await testDb.insert(invites).values(inviteData);

      const found = await inviteRepository.findById(inviteData.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(inviteData.id);
      expect(found?.email).toBe(inviteData.email);
      expect(found?.role).toBe(inviteData.role);
    });
  });

  describe('findValidInvite', () => {
    it('should return null if no invite matches the combination of email, code, and orgId', async () => {
      const result = await inviteRepository.findValidInvite(
        'wrong@example.com',
        'SECRET123',
        defaultOrgId,
      );
      expect(result).toBeNull();
    });

    it('should retrieve the invite when email, code, and orgId all match perfectly', async () => {
      const inviteId = crypto.randomUUID();
      const inviteData = {
        id: inviteId,
        email: 'valid@example.com',
        orgId: defaultOrgId,
        code: 'VALID_CODE',
        role: 'member' as const,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await testDb.insert(invites).values(inviteData);

      const found = await inviteRepository.findValidInvite(
        'valid@example.com',
        'VALID_CODE',
        defaultOrgId,
      );

      expect(found).not.toBeNull();
      expect(found?.id).toBe(inviteData.id);
    });
  });

  describe('upsert', () => {
    it('should successfully insert a new invite row if the unique combination does not exist', async () => {
      const inviteId = crypto.randomUUID();
      const newInvite = {
        id: inviteId,
        email: 'upsert-new@example.com',
        orgId: defaultOrgId,
        code: 'CODE1',
        role: 'member' as const,
        expiresAt: new Date(Date.now() + 3600000),
      };

      const result = await inviteRepository.upsert(newInvite);

      expect(result).toBeDefined();
      expect(result.id).toBe(newInvite.id);
      expect(result.email).toBe(newInvite.email);

      const [dbRow] = await testDb.select().from(invites).where(eq(invites.id, newInvite.id));

      expect(dbRow).toBeDefined();
    });

    it('should conflict and update the existing record fields on matching email and orgId', async () => {
      const initialInviteId = crypto.randomUUID();
      const initialInvite = {
        id: initialInviteId,
        email: 'conflict@example.com',
        orgId: defaultOrgId,
        code: 'OLD_CODE',
        role: 'member' as const,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await testDb.insert(invites).values(initialInvite);

      const updatedInviteData = {
        id: initialInviteId,
        email: 'conflict@example.com',
        orgId: defaultOrgId,
        code: 'NEW_CODE',
        role: 'admin' as const,
        expiresAt: new Date(Date.now() + 7200000),
      };

      const result = await inviteRepository.upsert(updatedInviteData);

      expect(result).toBeDefined();
      expect(result.code).toBe('NEW_CODE');
      expect(result.role).toBe('admin');
      expect(result.id).toBe(initialInviteId);

      const matchingRows = await testDb
        .select()
        .from(invites)
        .where(eq(invites.email, 'conflict@example.com'));

      expect(matchingRows.length).toBe(1);
    });
  });

  describe('deleteById', () => {
    it('should return false if target record to delete does not exist', async () => {
      const nonExistentInviteId = crypto.randomUUID();
      const result = await inviteRepository.deleteById(nonExistentInviteId);
      expect(result).toBe(false);
    });

    it('should return true and successfully remove the entry from the database', async () => {
      const inviteId = crypto.randomUUID();
      const inviteData = {
        id: inviteId,
        email: 'delete@example.com',
        orgId: defaultOrgId,
        code: 'DEL123',
        role: 'member' as const,
        expiresAt: new Date(Date.now() + 3600000),
      };

      await testDb.insert(invites).values(inviteData);

      const deleted = await inviteRepository.deleteById(inviteData.id);
      expect(deleted).toBe(true);

      const [dbRow] = await testDb.select().from(invites).where(eq(invites.id, inviteData.id));

      expect(dbRow).toBeUndefined();
    });
  });

  describe('deleteExpired', () => {
    it('should clean up expired invites and return the rowCount of deleted records', async () => {
      const pastInviteId1 = crypto.randomUUID();
      const pastInviteId2 = crypto.randomUUID();
      const futureInviteId = crypto.randomUUID();

      const pastInvite1 = {
        id: pastInviteId1,
        email: 'expired1@example.com',
        orgId: defaultOrgId,
        code: 'EXP1',
        role: 'member' as const,
        expiresAt: new Date('2020-06-23T11:00:00Z'),
      };

      const pastInvite2 = {
        id: pastInviteId2,
        email: 'expired2@example.com',
        orgId: defaultOrgId,
        code: 'EXP2',
        role: 'member' as const,
        expiresAt: new Date('2020-06-23T11:59:00Z'),
      };

      const futureInvite = {
        id: futureInviteId,
        email: 'future@example.com',
        orgId: defaultOrgId,
        code: 'FUTURE1',
        role: 'admin' as const,
        expiresAt: new Date('2020-06-23T13:00:00Z'),
      };

      await testDb.insert(invites).values([pastInvite1, pastInvite2, futureInvite]);

      const deletedCount = await inviteRepository.deleteExpired(new Date());

      expect(deletedCount).toBe(2);

      const checkedInvites = await testDb
        .select()
        .from(invites)
        .where(inArray(invites.id, [pastInviteId1, pastInviteId2, futureInviteId]));

      expect(checkedInvites.length).toBe(1);
      expect(checkedInvites[0].id).toBe(futureInviteId);
    });
  });
});
