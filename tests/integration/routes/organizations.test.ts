import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

import { emailService as mockEmailService } from '../../../src/services/email.service.js';

vi.mock('../../../src/services/email.service.js', () => {
  return {
    emailService: {
      send: vi.fn().mockResolvedValue({ success: true }),
    },
  };
});

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
    vi.clearAllMocks();
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

  describe('POST /api/organizations/members/remove', () => {
    it('should allow an admin to successfully remove a member from their organization', async () => {
      const ORG_ID = crypto.randomUUID();
      const ADMIN_ID = 'caller_admin_user';
      const TARGET_MEMBER_ID = 'target_member_user';

      await testDb.insert(organizations).values({
        id: ORG_ID,
        name: 'The Village Pantry',
        type: 'pantry',
        subdomain: 'village-pantry',
        city: 'Madison',
        state: 'WI',
        country: 'United States',
        zip: '53703',
      });

      await testDb.insert(users).values([
        {
          id: ADMIN_ID,
          name: 'Admin User',
          email: 'admin@village.org',
          organizationId: ORG_ID,
          orgRole: 'admin',
        },
        {
          id: TARGET_MEMBER_ID,
          name: 'Regular Member',
          email: 'member@village.org',
          organizationId: ORG_ID,
          orgRole: 'member',
        },
      ]);

      const res = await authedRequest(
        '/api/organizations/members/remove',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: TARGET_MEMBER_ID }),
        },
        { id: ADMIN_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, TARGET_MEMBER_ID));

      expect(updatedUser.organizationId).toBeNull();
      expect(updatedUser.orgRole).toBeNull();

      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
    });

    it('should return 403 if the caller is a member and attempts to remove someone', async () => {
      const ORG_ID = crypto.randomUUID();
      const MEMBER_CALLER_ID = 'caller_regular_user';
      const TARGET_MEMBER_ID = 'other_member_user';

      await testDb.insert(users).values([
        {
          id: MEMBER_CALLER_ID,
          name: 'Regular Member',
          email: 'member1@village.org',
          organizationId: ORG_ID,
          orgRole: 'member',
        },
        {
          id: TARGET_MEMBER_ID,
          name: 'Another Member',
          email: 'member2@village.org',
          organizationId: ORG_ID,
          orgRole: 'member',
        },
      ]);

      const res = await authedRequest(
        '/api/organizations/members/remove',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: TARGET_MEMBER_ID }),
        },
        { id: MEMBER_CALLER_ID },
      );

      expect(res.status).toBe(403);
    });

    it('should return 403 if target user belongs to a completely different organization', async () => {
      const ORG_A_ID = crypto.randomUUID();
      const ORG_B_ID = crypto.randomUUID();
      const ADMIN_A_ID = 'admin_org_a';
      const USER_B_ID = 'user_org_b';

      await testDb.insert(users).values([
        {
          id: ADMIN_A_ID,
          name: 'Admin Org A',
          email: 'admin@orga.com',
          organizationId: ORG_A_ID,
          orgRole: 'admin',
        },
        {
          id: USER_B_ID,
          name: 'User Org B',
          email: 'user@orgb.com',
          organizationId: ORG_B_ID,
          orgRole: 'member',
        },
      ]);

      const res = await authedRequest(
        '/api/organizations/members/remove',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: USER_B_ID }),
        },
        { id: ADMIN_A_ID },
      );

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/organizations/members/role', () => {
    it('should successfully update a user role when executed by a valid organization admin', async () => {
      const ORG_ID = crypto.randomUUID();
      const ADMIN_ID = 'admin_user_role_test';
      const TARGET_USER_ID = 'target_user_role_test';

      await testDb.insert(organizations).values({
        id: ORG_ID,
        name: 'The Village Pantry',
        type: 'pantry',
        subdomain: 'village-pantry-role',
        city: 'Madison',
        state: 'WI',
        country: 'United States',
        zip: '53703',
      });

      await testDb.insert(users).values([
        {
          id: ADMIN_ID,
          name: 'Admin User',
          email: 'admin@village.org',
          organizationId: ORG_ID,
          orgRole: 'admin',
        },
        {
          id: TARGET_USER_ID,
          name: 'Regular Member',
          email: 'member@village.org',
          organizationId: ORG_ID,
          orgRole: 'member',
        },
      ]);

      const res = await authedRequest(
        '/api/organizations/members/role',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: TARGET_USER_ID, role: 'admin' }),
        },
        { id: ADMIN_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        userId: TARGET_USER_ID,
        role: 'admin',
      });

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, TARGET_USER_ID));

      expect(updatedUser.orgRole).toBe('admin');

      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when an invalid organization role variant is provided', async () => {
      const ADMIN_ID = 'admin_user_validation';

      await testDb.insert(users).values({
        id: ADMIN_ID,
        name: 'Admin User',
        email: 'admin@validation.org',
        organizationId: crypto.randomUUID(),
        orgRole: 'admin',
      });

      const res = await authedRequest(
        '/api/organizations/members/role',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 'some_user', role: 'super-emperor' }),
        },
        { id: ADMIN_ID },
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 when trying to update a user that does not exist', async () => {
      const ORG_ID = crypto.randomUUID();
      const ADMIN_ID = 'admin_user_404_test';

      await testDb.insert(users).values({
        id: ADMIN_ID,
        name: 'Admin User',
        email: 'admin@village.org',
        organizationId: ORG_ID,
        orgRole: 'admin',
      });

      const missingUserId = crypto.randomUUID();

      const res = await authedRequest(
        '/api/organizations/members/role',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: missingUserId, role: 'member' }),
        },
        { id: ADMIN_ID },
      );

      expect(res.status).toBe(404);
    });
  });
});
