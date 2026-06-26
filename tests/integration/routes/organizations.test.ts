import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { organizations, users } from '../../../src/db/schema.js';

describe('Organizations API - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'user_auth_org_123';

  beforeAll(() => {
    testDb = getTestDb();
    organizationRepository.setDb(testDb);
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  describe('GET /api/organizations/subdomain/check', () => {
    it('should return 200 and available true for an unclaimed subdomain', async () => {
      const res = await authedRequest(
        '/api/organizations/subdomain/check?subdomain=fresh-start-pantry',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ available: true });
    });

    it('should return 200 with an incremental suggestion variant if already taken', async () => {
      await testDb.insert(organizations).values({
        name: 'Existing Kitchen',
        type: 'restaurant',
        subdomain: 'bistro-hub',
      });

      const res = await authedRequest(
        '/api/organizations/subdomain/check?subdomain=bistro-hub',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ available: false, suggestion: 'bistro-hub1' });
    });

    it('should return 400 validation error if subdomain parameter contains illegal characters', async () => {
      const res = await authedRequest(
        '/api/organizations/subdomain/check?subdomain=Invalid_Subdomain!',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/organizations/', () => {
    const getValidPayload = (subdomain = `madison-harvest-${crypto.randomUUID().slice(0, 6)}`) => ({
      name: 'Madison Harvest Lounge',
      type: 'restaurant',
      address: '456 East Washington Ave',
      city: 'Madison',
      state: 'WI',
      country: 'United States',
      zip: '53703',
      lat: 43.0754,
      lng: -89.3812,
      subdomain,
    });

    beforeEach(async () => {
      await testDb.insert(users).values({
        id: TEST_USER_ID,
        name: 'Test Admin User',
        email: 'admin-test@example.com',
        organizationId: null,
        orgRole: null,
      });
    });

    it('should return 201, persist record to database, and link the user as an admin', async () => {
      const validPayload = getValidPayload();
      const res = await authedRequest(
        '/api/organizations',
        {
          method: 'POST',
          body: JSON.stringify(validPayload),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe(validPayload.name);

      const [dbOrgRow] = await testDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, body.id));
      expect(dbOrgRow).toBeDefined();
      expect(dbOrgRow.subdomain).toBe(validPayload.subdomain);

      const [dbUserRow] = await testDb.select().from(users).where(eq(users.id, TEST_USER_ID));

      expect(dbUserRow).toBeDefined();
      expect(dbUserRow.organizationId).toBe(body.id);
      expect(dbUserRow.orgRole).toBe('admin');
    });

    it('should return 400 if layout validation rules are violated and NOT link the user', async () => {
      const invalidPayload = {
        ...getValidPayload(),
        name: '',
      };

      const res = await authedRequest(
        '/api/organizations',
        {
          method: 'POST',
          body: JSON.stringify(invalidPayload),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(400);

      const [dbUserRow] = await testDb.select().from(users).where(eq(users.id, TEST_USER_ID));
      expect(dbUserRow.organizationId).toBeNull();
      expect(dbUserRow.orgRole).toBeNull();
    });

    it('should return 409 Conflict if trying to secure an unoriginal subdomain and NOT link the user', async () => {
      await testDb.insert(organizations).values({
        name: 'Duplicate Place',
        type: 'pantry',
        subdomain: 'madison-harvest',
      });

      const res = await authedRequest(
        '/api/organizations',
        {
          method: 'POST',
          body: JSON.stringify(getValidPayload('madison-harvest')),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(409);

      const [dbUserRow] = await testDb.select().from(users).where(eq(users.id, TEST_USER_ID));
      expect(dbUserRow.organizationId).toBeNull();
      expect(dbUserRow.orgRole).toBeNull();
    });

    it('should return 401 Unauthorized if request context fails identity check', async () => {
      const res = await authedRequest(
        '/api/organizations',
        {
          method: 'POST',
          body: JSON.stringify(getValidPayload()),
        },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/organizations/:id', () => {
    it('should return 200 and alter target record attributes on partial updates', async () => {
      const [org] = await testDb
        .insert(organizations)
        .values({
          name: 'Pantry Alpha',
          type: 'pantry',
          subdomain: 'pantry-alpha',
        })
        .returning();

      const res = await authedRequest(
        `/api/organizations/${org.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Pantry Alpha Revised' }),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Pantry Alpha Revised');
    });

    it('should return 400 if updating spatial info partially without completing the coordinate cluster', async () => {
      const [org] = await testDb
        .insert(organizations)
        .values({
          name: 'Pantry Beta',
          type: 'pantry',
          subdomain: 'pantry-beta',
        })
        .returning();

      const res = await authedRequest(
        `/api/organizations/${org.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            address: '789 Spatial Way',
            city: 'Madison',
            state: 'WI',
            country: 'USA',
            zip: '53711',
          }),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 if reference entity target does not exist', async () => {
      const randomId = crypto.randomUUID();
      const res = await authedRequest(
        `/api/organizations/${randomId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Ghost Update' }),
        },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/organizations/:id', () => {
    it('should return 200, remove organization, and disassociate connected users', async () => {
      const [org] = await testDb
        .insert(organizations)
        .values({
          name: 'Disposable Org',
          type: 'restaurant',
          subdomain: 'dump-me',
        })
        .returning();

      const CONNECTED_USER_ID = 'connected_user_555';
      const UNRELATED_USER_ID = 'unrelated_user_777';
      const OTHER_ORG_ID = crypto.randomUUID();

      await testDb.insert(organizations).values({
        id: OTHER_ORG_ID,
        name: 'Safe Org',
        type: 'pantry',
        subdomain: 'safe-zone',
      });

      await testDb.insert(users).values([
        {
          id: CONNECTED_USER_ID,
          name: 'Target Employee',
          email: 'employee@dumpme.com',
          organizationId: org.id,
          orgRole: 'member',
        },
        {
          id: UNRELATED_USER_ID,
          name: 'Other Employee',
          email: 'employee@safezone.com',
          organizationId: OTHER_ORG_ID,
          orgRole: 'admin',
        },
      ]);

      const res = await authedRequest(
        `/api/organizations/${org.id}`,
        { method: 'DELETE' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const [dbOrgRow] = await testDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, org.id));
      expect(dbOrgRow).toBeUndefined();

      const [dbConnectedUser] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, CONNECTED_USER_ID));
      expect(dbConnectedUser).toBeDefined();
      expect(dbConnectedUser.organizationId).toBeNull();
      expect(dbConnectedUser.orgRole).toBeNull();

      const [dbUnrelatedUser] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, UNRELATED_USER_ID));
      expect(dbUnrelatedUser).toBeDefined();
      expect(dbUnrelatedUser.organizationId).toBe(OTHER_ORG_ID);
      expect(dbUnrelatedUser.orgRole).toBe('admin');
    });

    it('should return 404 when referencing missing organization structures during drop routine', async () => {
      const randomId = crypto.randomUUID();
      const res = await authedRequest(
        `/api/organizations/${randomId}`,
        { method: 'DELETE' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/organizations/:id', () => {
    it('should return 200 and organization properties when matching record is found', async () => {
      const [org] = await testDb
        .insert(organizations)
        .values({
          name: 'Target Pantry',
          type: 'pantry',
          subdomain: 'target-pantry',
          city: 'Madison',
          state: 'WI',
          country: 'United States',
          zip: '53703',
        })
        .returning();

      const res = await authedRequest(
        `/api/organizations/${org.id}`,
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(org.id);
      expect(body.name).toBe('Target Pantry');
      expect(body.subdomain).toBe('target-pantry');
    });

    it('should return 404 when referencing an organization ID that does not exist', async () => {
      const randomId = crypto.randomUUID();
      const res = await authedRequest(
        `/api/organizations/${randomId}`,
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(404);
    });
  });
});
