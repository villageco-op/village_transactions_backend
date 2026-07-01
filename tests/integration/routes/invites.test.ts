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

    it('should return 200, apply organization profile parameters to user, and remove the processed invite row', async () => {
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

      const [deletedInvite] = await testDb.select().from(invites).where(eq(invites.id, inviteId));

      expect(deletedInvite).toBeUndefined();
    });
  });
});
