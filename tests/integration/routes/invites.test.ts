import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { inviteRepository } from '../../../src/repositories/invite.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { invites, organizations, users } from '../../../src/db/schema.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { transactionRepository } from '../../../src/repositories/transaction.repository.js';

vi.mock('../../../src/services/email.service.js', () => {
  return {
    emailService: {
      send: vi.fn().mockResolvedValue({ success: true }),
    },
  };
});

import { emailService as mockEmailService } from '../../../src/services/email.service.js';

describe('Invites API - Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const CALLER_USER_ID = 'caller-user-uuid-111';
  const TARGET_USER_ID = 'target-user-uuid-222';
  let defaultOrgId: string;

  beforeAll(() => {
    testDb = getTestDb();
    inviteRepository.setDb(testDb);
    userRepository.setDb(testDb);
    organizationRepository.setDb(testDb);
    transactionRepository.setDb(testDb);
    vi.useFakeTimers();
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
    vi.clearAllMocks();
    await truncateTables(testDb);

    const uniqueSubdomain = `test-org-${Math.random().toString(36).substring(2, 7)}`;

    const [org] = await testDb
      .insert(organizations)
      .values({
        name: 'Co-op Hub',
        type: 'pantry',
        subdomain: uniqueSubdomain,
        city: 'Madison',
        state: 'WI',
        country: 'USA',
      })
      .returning();

    defaultOrgId = org.id;
  });

  describe('POST /api/invites/invite', () => {
    it('should return 401 Unauthorized if the client lacks a valid authentication context', async () => {
      const res = await authedRequest(
        '/api/invites/invite',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'newbie@example.com', role: 'member' }),
        },
        { id: '' },
      );

      expect(res.status).toBe(401);
    });

    it('should return 400 Bad Request if the caller user profile cannot be resolved in the database', async () => {
      const res = await authedRequest(
        '/api/invites/invite',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'newbie@example.com', role: 'member' }),
        },
        { id: 'non-existent-caller-id' },
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 Bad Request if the authenticated caller lacks an organization connection profile', async () => {
      await testDb.insert(users).values({
        id: CALLER_USER_ID,
        email: 'caller@example.com',
        organizationId: null,
      });

      const res = await authedRequest(
        '/api/invites/invite',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'newbie@example.com', role: 'member' }),
        },
        { id: CALLER_USER_ID },
      );

      expect(res.status).toBe(400);
    });

    it('should return 200, insert an invite row, and call resend email service when inputs are valid', async () => {
      await testDb.insert(users).values({
        id: CALLER_USER_ID,
        email: 'caller@example.com',
        organizationId: defaultOrgId,
      });

      vi.mocked(mockEmailService.send).mockResolvedValueOnce({
        success: true,
      });

      const invitePayload = { email: 'invited-collaborator@example.com', role: 'admin' };

      const res = await authedRequest(
        '/api/invites/invite',
        {
          method: 'POST',
          body: JSON.stringify(invitePayload),
        },
        { id: CALLER_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();

      const [dbRow] = await testDb.select().from(invites).where(eq(invites.id, body.id));

      expect(dbRow).toBeDefined();
      expect(dbRow.email).toBe(invitePayload.email);
      expect(dbRow.role).toBe(invitePayload.role);
      expect(dbRow.orgId).toBe(defaultOrgId);
      expect(mockEmailService.send).toHaveBeenCalled();
    });

    it('should return 502 Bad Gateway if the downstream Resend communication network fails', async () => {
      await testDb.insert(users).values({
        id: CALLER_USER_ID,
        email: 'caller@example.com',
        organizationId: defaultOrgId,
      });

      vi.mocked(mockEmailService.send).mockResolvedValueOnce({
        success: false,
        error: { message: 'Out of mail credits' },
      } as any);

      const res = await authedRequest(
        '/api/invites/invite',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'unlucky@example.com', role: 'member' }),
        },
        { id: CALLER_USER_ID },
      );

      expect(res.status).toBe(502);
    });
  });

  describe('POST /api/invites/accept', () => {
    const defaultInviteCode = 'acceptcode123456';
    const inviteeEmail = 'target-invitee@example.com';

    beforeEach(async () => {
      await testDb.insert(users).values({
        id: TARGET_USER_ID,
        email: inviteeEmail,
        organizationId: null,
      });
    });

    it('should return 400 Bad Request if the request token code or parameters match no invite record', async () => {
      const res = await authedRequest(
        '/api/invites/accept',
        {
          method: 'POST',
          body: JSON.stringify({
            email: inviteeEmail,
            code: 'WRONG_CODE',
            orgId: defaultOrgId,
          }),
        },
        { id: TARGET_USER_ID },
      );

      expect(res.status).toBe(400);
    });

    it('should return 400 Bad Request if the invite record is parsed but has crossed its expiration date', async () => {
      await testDb.insert(invites).values({
        email: inviteeEmail,
        orgId: defaultOrgId,
        code: defaultInviteCode,
        role: 'member',
        expiresAt: new Date('2026-06-20T12:00:00Z'),
      });

      const res = await authedRequest(
        '/api/invites/accept',
        {
          method: 'POST',
          body: JSON.stringify({
            email: inviteeEmail,
            code: defaultInviteCode,
            orgId: defaultOrgId,
          }),
        },
        { id: TARGET_USER_ID },
      );

      expect(res.status).toBe(400);
    });

    it('should return 404 Not Found if the invite record exists but the corresponding user account profile does not', async () => {
      const untrackedEmail = 'unregistered@example.com';
      await testDb.insert(invites).values({
        email: untrackedEmail,
        orgId: defaultOrgId,
        code: defaultInviteCode,
        role: 'member',
        expiresAt: new Date('2026-06-30T12:00:00Z'),
      });

      const res = await authedRequest(
        '/api/invites/accept',
        {
          method: 'POST',
          body: JSON.stringify({
            email: untrackedEmail,
            code: defaultInviteCode,
            orgId: defaultOrgId,
          }),
        },
        { id: 'some-random-id' },
      );

      expect(res.status).toBe(404);
    });

    it('should return 200, apply organization profile parameters to user, and mark the processed invite row as accepted', async () => {
      const inviteId = crypto.randomUUID();
      await testDb.insert(invites).values({
        id: inviteId,
        email: inviteeEmail,
        orgId: defaultOrgId,
        code: defaultInviteCode,
        role: 'admin',
        expiresAt: new Date('2026-06-30T12:00:00Z'),
      });

      const res = await authedRequest(
        '/api/invites/accept',
        {
          method: 'POST',
          body: JSON.stringify({
            email: inviteeEmail,
            code: defaultInviteCode,
            orgId: defaultOrgId,
          }),
        },
        { id: TARGET_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const [updatedUser] = await testDb.select().from(users).where(eq(users.id, TARGET_USER_ID));
      expect(updatedUser.organizationId).toBe(defaultOrgId);
      expect(updatedUser.orgRole).toBe('admin');

      const [updatedInvite] = await testDb.select().from(invites).where(eq(invites.id, inviteId));
      expect(updatedInvite).toBeDefined();
      expect(updatedInvite.status).toBe('accepted');
      expect(updatedInvite.code).toBeNull();
    });
  });

  describe('GET /api/invites/list', () => {
    const ADMIN_USER_ID = 'admin-user-uuid-888';
    const MEMBER_USER_ID = 'member-user-uuid-444';

    beforeEach(async () => {
      await testDb.insert(users).values({
        id: ADMIN_USER_ID,
        email: 'admin@example.com',
        organizationId: defaultOrgId,
        orgRole: 'admin',
      });

      await testDb.insert(users).values({
        id: MEMBER_USER_ID,
        email: 'member@example.com',
        organizationId: defaultOrgId,
        orgRole: 'member',
      });

      await testDb.insert(invites).values([
        {
          id: crypto.randomUUID(),
          email: 'invite1@example.com',
          orgId: defaultOrgId,
          code: 'CODE1',
          role: 'member',
          status: 'pending',
          expiresAt: new Date('2026-06-30T12:00:00Z'),
          createdAt: new Date('2026-06-23T11:00:00Z'),
        },
        {
          id: crypto.randomUUID(),
          email: 'invite2@example.com',
          orgId: defaultOrgId,
          code: 'CODE2',
          role: 'member',
          status: 'accepted',
          expiresAt: new Date('2026-06-30T12:00:00Z'),
          createdAt: new Date('2026-06-23T10:00:00Z'),
        },
      ]);
    });

    it('should return 401 Unauthorized if the client lacks a session', async () => {
      const res = await authedRequest(
        '/api/invites/list?page=1&limit=10',
        { method: 'GET' },
        { id: '' },
      );
      expect(res.status).toBe(401);
    });

    it('should return 403 Forbidden if the calling user is not an organization admin', async () => {
      const res = await authedRequest(
        '/api/invites/list?page=1&limit=10',
        { method: 'GET' },
        { id: MEMBER_USER_ID },
      );
      expect(res.status).toBe(403);
    });

    it('should return 404 Not Found if the caller has no organization association profile', async () => {
      const unaffiliatedUserId = crypto.randomUUID();
      await testDb.insert(users).values({
        id: unaffiliatedUserId,
        email: 'lonewolf@example.com',
        organizationId: null,
        orgRole: 'admin',
      });

      const res = await authedRequest(
        '/api/invites/list?page=1&limit=10',
        { method: 'GET' },
        { id: unaffiliatedUserId },
      );
      expect(res.status).toBe(404);
    });

    it('should return 200 with paginated invites and metadata when executed by an admin', async () => {
      const res = await authedRequest(
        '/api/invites/list?page=1&limit=1',
        { method: 'GET' },
        { id: ADMIN_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBe(1);
      expect(body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 1,
        totalPages: expect.any(Number),
      });
      expect(body.data[0].email).toBe('invite1@example.com');
    });

    it('should cleanly apply status parameter filters', async () => {
      const res = await authedRequest(
        '/api/invites/list?page=1&limit=10&status=accepted',
        { method: 'GET' },
        { id: ADMIN_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.every((invite: any) => invite.status === 'accepted')).toBe(true);
    });
  });
});
