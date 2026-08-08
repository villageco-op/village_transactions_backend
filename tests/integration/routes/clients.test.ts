import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { clientRepository } from '../../../src/repositories/client.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { clients, organizations, referrals, users } from '../../../src/db/schema.js';

describe('Clients API - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const AUTH_USER_ID = 'auth-user-uuid-111';
  let defaultOrgId: string;
  const MOCK_SYSTEM_TIME = new Date('2026-07-18T12:00:00Z');

  beforeAll(() => {
    testDb = getTestDb();
    clientRepository.setDb(testDb);
    userRepository.setDb(testDb);
    organizationRepository.setDb(testDb);
    vi.useFakeTimers();
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(MOCK_SYSTEM_TIME);
    vi.clearAllMocks();
    await truncateTables(testDb);

    const uniqueSubdomain = `test-org-${crypto.randomUUID().substring(0, 5)}`;
    const [org] = await testDb
      .insert(organizations)
      .values({
        id: crypto.randomUUID(),
        name: 'Route Test Org',
        type: 'pantry',
        subdomain: uniqueSubdomain,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      })
      .returning();
    defaultOrgId = org.id;

    await testDb.insert(users).values({
      id: AUTH_USER_ID,
      name: 'Authenticated Route User',
      email: 'auth-user@example.com',
      organizationId: defaultOrgId,
      orgRole: 'admin',
    });
  });

  describe('POST /api/clients', () => {
    it('should return 401 Unauthorized if missing session authorization properties', async () => {
      const res = await authedRequest(
        '/api/clients',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Jane Doe' }),
        },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });

    it('should return 201 and insert client database row under correct organization contexts', async () => {
      const payload = {
        name: 'John Doe',
        email: 'john.d@example.com',
        phone: '555-0192',
        address: '789 Route Ave',
        city: 'Town',
        state: 'WI',
        country: 'USA',
        zip: '51123',
      };

      const res = await authedRequest(
        '/api/clients',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe(payload.name);
      expect(data.referredBy).toBeNull();

      const [dbRow] = await testDb.select().from(clients).where(eq(clients.id, data.id));
      expect(dbRow).toBeDefined();
      expect(dbRow.organizationId).toBe(defaultOrgId);
    });

    it('should link explicit referrerId successfully if valid client row matches within organization context', async () => {
      const referrerId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: referrerId,
        name: 'Jane Referrer',
        email: 'jane.r@example.com',
        phone: '555-9000',
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const payload = {
        name: 'John Newbie',
        email: 'newbie@example.com',
        referrerId,
      };

      const res = await authedRequest(
        '/api/clients',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.referredBy).toEqual({
        id: referrerId,
        name: 'Jane Referrer',
        email: 'jane.r@example.com',
        phone: '555-9000',
      });

      const [referralRow] = await testDb
        .select()
        .from(referrals)
        .where(eq(referrals.referredId, data.id));
      expect(referralRow).toBeDefined();
      expect(referralRow.referrerId).toBe(referrerId);
    });
  });

  describe('GET /api/clients/search-referrer', () => {
    beforeEach(async () => {
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Alice Smith',
          email: 'alice.smith@example.com',
          phone: '555-7777',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          name: 'Bob Smith',
          email: 'bob.smith@example.com',
          phone: '555-8888',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
      ]);
    });

    it('should return 401 Unauthorized if missing session credentials', async () => {
      const res = await authedRequest(
        '/api/clients/search-referrer?q=Alice',
        {
          method: 'GET',
        },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });

    it('should flag exactMatch true when query strikes a singular exact email hit', async () => {
      const res = await authedRequest(
        '/api/clients/search-referrer?q=alice.smith@example.com',
        {
          method: 'GET',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.exactMatch).toBe(true);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].name).toBe('Alice Smith');
    });

    it('should flag exactMatch false and cascade to fuzzy matches when multiple common names emerge', async () => {
      const res = await authedRequest(
        '/api/clients/search-referrer?q=Smith',
        {
          method: 'GET',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.exactMatch).toBe(false);
      expect(data.results).toHaveLength(2);

      const names = data.results.map((r: any) => r.name);
      expect(names).toContain('Alice Smith');
      expect(names).toContain('Bob Smith');
    });
  });

  describe('GET /api/clients', () => {
    beforeEach(async () => {
      await testDb.insert(clients).values([
        {
          id: crypto.randomUUID(),
          name: 'Alpha Client',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
        {
          id: crypto.randomUUID(),
          name: 'Beta Client',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
      ]);
    });

    it('should return 200 along with correct paginated payload structural arrays', async () => {
      const res = await authedRequest(
        '/api/clients?page=1&limit=1',
        {
          method: 'GET',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.meta.total).toBe(2);
      expect(body.meta.totalPages).toBe(2);
    });

    it('should match filter parameters successfully when string searching is applied', async () => {
      const res = await authedRequest(
        '/api/clients?search=Beta',
        {
          method: 'GET',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Beta Client');
    });
  });

  describe('PUT /api/clients/:id', () => {
    it('should return 404 if the specified update target is missing inside the org domain space', async () => {
      const randomId = crypto.randomUUID();
      const res = await authedRequest(
        `/api/clients/${randomId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'New Name' }),
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(404);
    });

    it('should return 200 and alter data rows fields for valid operations matching payload', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Old Name',
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const res = await authedRequest(
        `/api/clients/${clientId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Modified Route Name' }),
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Modified Route Name');
    });
  });

  describe('POST /api/clients/:id/deactivate', () => {
    it('should flip active flag state to false cleanly on valid record references', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Active Client',
        active: true,
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const res = await authedRequest(
        `/api/clients/${clientId}/deactivate`,
        {
          method: 'POST',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.active).toBe(false);

      const [dbRow] = await testDb.select().from(clients).where(eq(clients.id, clientId));
      expect(dbRow.active).toBe(false);
    });
  });

  describe('DELETE /api/clients/:id', () => {
    it('should purge target entry from schema constraints completely and safely', async () => {
      const clientId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: clientId,
        name: 'Disposable Record',
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const res = await authedRequest(
        `/api/clients/${clientId}`,
        {
          method: 'DELETE',
        },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const [dbRow] = await testDb.select().from(clients).where(eq(clients.id, clientId));
      expect(dbRow).toBeUndefined();
    });
  });

  describe('GET /api/clients/:id/referrals', () => {
    it('should return 401 Unauthorized if authorization credentials are missing', async () => {
      const res = await authedRequest(
        `/api/clients/${crypto.randomUUID()}/referrals`,
        { method: 'GET' },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });

    it('should return 404 if the referrer client profile does not exist', async () => {
      const res = await authedRequest(
        `/api/clients/${crypto.randomUUID()}/referrals`,
        { method: 'GET' },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 if the referrer client exists but belongs to a different organization', async () => {
      const altOrgId = crypto.randomUUID();
      const uniqueSubdomain = `alt-org-${crypto.randomUUID().substring(0, 5)}`;
      await testDb.insert(organizations).values({
        id: altOrgId,
        name: 'Alt Org Route',
        type: 'pantry',
        subdomain: uniqueSubdomain,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      });

      const altReferrerId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: altReferrerId,
        name: 'Alt Referrer',
        organizationId: altOrgId,
        createdById: AUTH_USER_ID,
      });

      const res = await authedRequest(
        `/api/clients/${altReferrerId}/referrals`,
        { method: 'GET' },
        { id: AUTH_USER_ID }, // Requests with defaultOrgId context
      );

      expect(res.status).toBe(404);
    });

    it('should return 200 with an empty list and correct paginated structure if client has no referrals', async () => {
      const referrerId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: referrerId,
        name: 'Jane Referrer',
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const res = await authedRequest(
        `/api/clients/${referrerId}/referrals`,
        { method: 'GET' },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });

    it('should return 200 with paginated referrals and correct metadata', async () => {
      const referrerId = crypto.randomUUID();
      await testDb.insert(clients).values({
        id: referrerId,
        name: 'Jane Referrer',
        organizationId: defaultOrgId,
        createdById: AUTH_USER_ID,
      });

      const referredId1 = crypto.randomUUID();
      const referredId2 = crypto.randomUUID();

      await testDb.insert(clients).values([
        {
          id: referredId1,
          name: 'Referred Client One',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
        {
          id: referredId2,
          name: 'Referred Client Two',
          organizationId: defaultOrgId,
          createdById: AUTH_USER_ID,
        },
      ]);

      await testDb.insert(referrals).values([
        {
          id: crypto.randomUUID(),
          referrerId,
          referredId: referredId1,
        },
        {
          id: crypto.randomUUID(),
          referrerId,
          referredId: referredId2,
        },
      ]);

      const res = await authedRequest(
        `/api/clients/${referrerId}/referrals?page=1&limit=1`,
        { method: 'GET' },
        { id: AUTH_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 1,
        totalPages: 2,
      });

      const item = body.data[0];
      expect(item.id).toBeDefined();
      expect(item.referredBy).toEqual({
        id: referrerId,
        name: 'Jane Referrer',
        email: null,
        phone: null,
      });
    });
  });
});
