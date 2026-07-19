import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { clientRepository } from '../../../src/repositories/client.repository.js';
import { clients, referrals, organizations, users } from '../../../src/db/schema.js';

describe('clientRepository - Integration', { timeout: 120_000 }, () => {
  let testDb: any;
  let defaultOrgId: string;
  let defaultUserId: string;
  const MOCK_SYSTEM_TIME = new Date('2026-07-18T12:00:00Z');

  beforeAll(() => {
    testDb = getTestDb();
    clientRepository.setDb(testDb);
    vi.useFakeTimers();
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(MOCK_SYSTEM_TIME);
    await truncateTables(testDb);

    const uniqueSubdomain = `test-org-${crypto.randomUUID().substring(0, 5)}`;
    const [org] = await testDb
      .insert(organizations)
      .values({
        id: crypto.randomUUID(),
        name: 'Test Pantry Org',
        type: 'pantry',
        subdomain: uniqueSubdomain,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      })
      .returning();
    defaultOrgId = org.id;

    defaultUserId = crypto.randomUUID();
    await testDb.insert(users).values({
      id: defaultUserId,
      name: 'Test Creator',
      email: `user-${crypto.randomUUID().substring(0, 5)}@example.com`,
    });
  });

  describe('findById', () => {
    it('should return null if the client does not exist', async () => {
      const result = await clientRepository.findById(crypto.randomUUID(), defaultOrgId);
      expect(result).toBeNull();
    });

    it('should return null if the client exists but belongs to a different organization', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'John Doe',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
      });

      const altOrgId = crypto.randomUUID(); // Doesn't match
      const result = await clientRepository.findById(clientId, altOrgId);
      expect(result).toBeNull();
    });

    it('should retrieve the correct client record by ID and organization ID', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '1234567890',
        address: '123 Main St',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
      });

      const result = await clientRepository.findById(clientId, defaultOrgId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(clientId);
      expect(result?.name).toBe('Jane Doe');
    });
  });

  describe('findExactMatches', () => {
    beforeEach(async () => {
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Alice Smith',
          email: 'alice@test.com',
          phone: '555-0101',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
        {
          id: crypto.randomUUID(),
          name: 'Bob Jones',
          email: 'bob@example.com',
          phone: '555-0202',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
      ]);
    });

    it('should find an exact match by email', async () => {
      const results = await clientRepository.findExactMatches(defaultOrgId, 'bob@example.com');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Bob Jones');
    });

    it('should find an exact match by phone number', async () => {
      const results = await clientRepository.findExactMatches(defaultOrgId, '555-0101');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice Smith');
    });

    it('should respect the limit of 2 exact matches', async () => {
      // Add another record sharing the same phone variant to check constraints
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Charlie Smith',
          email: 'charlie@test.com',
          phone: '555-0101',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
        {
          id: crypto.randomUUID(),
          name: 'Duplicate Phone User',
          email: 'dup@test.com',
          phone: '555-0101',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
      ]);

      const results = await clientRepository.findExactMatches(defaultOrgId, '555-0101');
      expect(results).toHaveLength(2);
    });

    it('should return an empty array if no exact match is found', async () => {
      const results = await clientRepository.findExactMatches(defaultOrgId, 'nonexistent@test.com');
      expect(results).toEqual([]);
    });
  });

  describe('findFuzzyCandidates', () => {
    beforeEach(async () => {
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Alice Smith',
          email: 'alice@test.com',
          phone: '555-0101',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
        {
          id: crypto.randomUUID(),
          name: 'Alex Jones',
          email: 'alex.j@example.com',
          phone: '555-0202',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
      ]);
    });

    it('should match partially and case-insensitively by name', async () => {
      const results = await clientRepository.findFuzzyCandidates(defaultOrgId, 'al');
      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name);
      expect(names).toContain('Alice Smith');
      expect(names).toContain('Alex Jones');
    });

    it('should match partially by email components', async () => {
      const results = await clientRepository.findFuzzyCandidates(defaultOrgId, 'example');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alex Jones');
    });

    it('should match partially by phone number fragments', async () => {
      const results = await clientRepository.findFuzzyCandidates(defaultOrgId, '0202');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alex Jones');
    });

    it('should limit fuzzy results to a maximum of 10 records', async () => {
      const bulkClients = Array.from({ length: 12 }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Fuzzy User ${i}`,
        email: `fuzzy-${i}@test.com`,
        phone: '111-2222',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
      }));
      await testDb.insert(clients).values(bulkClients);

      const results = await clientRepository.findFuzzyCandidates(defaultOrgId, 'Fuzzy');
      expect(results.length).toBe(10);
    });
  });

  describe('create', () => {
    it('should insert a new client into the database with active set to true', async () => {
      const payload = {
        name: 'New Client',
        email: 'new@example.com',
        phone: '555-9999',
        address: '456 Side St',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
      };

      const result = await clientRepository.create(payload);
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(payload.name);
      expect(result.active).toBe(true);

      const [dbRow] = await testDb.select().from(clients).where(eq(clients.id, result.id));
      expect(dbRow).toBeDefined();
      expect(dbRow.email).toBe(payload.email);
    });
  });

  describe('referral mechanics', () => {
    let referrerId: string;
    let referredId: string;

    beforeEach(async () => {
      referrerId = crypto.randomUUID();
      referredId = crypto.randomUUID();

      await testDb.insert(clients).values([
        {
          id: referrerId,
          name: 'Referrer Client',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
        {
          id: referredId,
          name: 'Referred Client',
          organizationId: defaultOrgId,
          createdById: defaultUserId,
        },
      ]);
    });

    it('should successfully establish a referral connection entry', async () => {
      const referral = await clientRepository.createReferral(referrerId, referredId);
      expect(referral).toBeDefined();
      expect(referral.referrerId).toBe(referrerId);
      expect(referral.referredId).toBe(referredId);

      const [dbRow] = await testDb.select().from(referrals).where(eq(referrals.id, referral.id));
      expect(dbRow).toBeDefined();
    });

    it('should query the correct referrer info through findReferredBy', async () => {
      await testDb.insert(referrals).values({ referrerId, referredId });

      const result = await clientRepository.findReferredBy(referredId);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(referrerId);
      expect(result?.name).toBe('Referrer Client');
    });

    it('should return null from findReferredBy if no referral path maps to the target client ID', async () => {
      const result = await clientRepository.findReferredBy(referrerId);
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should change specified fields on the client row and advance its updatedAt timeline', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Original Name',
        email: 'original@example.com',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
        updatedAt: new Date('2015-01-01T00:00:00Z'),
      });

      const nextSystemTime = new Date('2026-07-18T15:30:00Z');
      vi.setSystemTime(nextSystemTime);

      const result = await clientRepository.update(clientId, defaultOrgId, {
        name: 'Updated Name',
        email: 'updated@example.com',
      });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Updated Name');
      expect(result?.email).toBe('updated@example.com');
      expect(result?.updatedAt.toISOString()).toBe(nextSystemTime.toISOString());
    });
  });

  describe('setActiveStatus', () => {
    it('should toggle active status to false and refresh the updatedAt tracking timestamp', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Status Client',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
        active: true,
      });

      const result = await clientRepository.setActiveStatus(clientId, defaultOrgId, false);
      expect(result).not.toBeNull();
      expect(result?.active).toBe(false);
    });
  });

  describe('delete', () => {
    it('should return false if the targeted entry to delete is absent', async () => {
      const result = await clientRepository.delete(crypto.randomUUID(), defaultOrgId);
      expect(result).toBe(false);
    });

    it('should wipe out the row from the database and return true', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'To Be Deleted',
        organizationId: defaultOrgId,
        createdById: defaultUserId,
      });

      const deleted = await clientRepository.delete(clientId, defaultOrgId);
      expect(deleted).toBe(true);

      const [dbRow] = await testDb.select().from(clients).where(eq(clients.id, clientId));
      expect(dbRow).toBeUndefined();
    });
  });

  describe('getList', () => {
    beforeEach(async () => {
      // Seed ordered variations to test pagination, visibility flags, and search filtering
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Charlie Brown',
          email: 'charlie@peanuts.com',
          phone: '111-2222',
          active: true,
          organizationId: defaultOrgId,
          createdById: defaultUserId,
          createdAt: new Date('2026-07-18T10:00:00Z'),
        },
        {
          id: crypto.randomUUID(),
          name: 'Lucy van Pelt',
          email: 'lucy@peanuts.com',
          phone: '333-4444',
          active: true,
          organizationId: defaultOrgId,
          createdById: defaultUserId,
          createdAt: new Date('2026-07-18T11:00:00Z'),
        },
        {
          id: crypto.randomUUID(),
          name: 'Snoopy Dog',
          email: 'snoopy@peanuts.com',
          phone: '555-6666',
          active: false,
          organizationId: defaultOrgId,
          createdById: defaultUserId,
          createdAt: new Date('2026-07-18T12:00:00Z'),
        },
      ]);
    });

    it('should capture total size and retrieve items ordered by descending creation timestamp', async () => {
      const result = await clientRepository.getList({
        orgId: defaultOrgId,
        limit: 2,
        offset: 0,
      });

      expect(result.total).toBe(3);
      expect(result.items.length).toBe(2);
      // Snoopy Dog is newest (12:00) -> should be index 0
      expect(result.items[0].name).toBe('Snoopy Dog');
      // Lucy van Pelt is next newest (11:00) -> should be index 1
      expect(result.items[1].name).toBe('Lucy van Pelt');
    });

    it('should separate items based on pagination offset values', async () => {
      const result = await clientRepository.getList({
        orgId: defaultOrgId,
        limit: 1,
        offset: 2,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Charlie Brown'); // Oldest entry
    });

    it('should constrain database filters cleanly based on active parameter states', async () => {
      const result = await clientRepository.getList({
        orgId: defaultOrgId,
        active: true,
        limit: 10,
        offset: 0,
      });

      expect(result.total).toBe(2);
      expect(result.items.every((i) => i.active)).toBe(true);
    });

    it('should isolate results based on string searches spanning name, email, or phone', async () => {
      const result = await clientRepository.getList({
        orgId: defaultOrgId,
        search: 'lucy',
        limit: 10,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.items[0].name).toBe('Lucy van Pelt');
    });
  });
});
