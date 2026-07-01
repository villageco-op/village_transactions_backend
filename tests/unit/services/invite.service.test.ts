import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  createOrgInvite,
  acceptOrgInvite,
  clearExpiredInvites,
} from '../../../src/services/invite.service.js';
import { inviteRepository } from '../../../src/repositories/invite.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { db } from '../../../src/db/index.js';
import { emailService } from '../../../src/services/email.service.js';

vi.mock('../../../src/repositories/invite.repository.js', () => ({
  inviteRepository: {
    upsert: vi.fn(),
    findValidInvite: vi.fn(),
    deleteById: vi.fn(),
    deleteExpired: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updateOrgAndRole: vi.fn(),
  },
}));

vi.mock('../../../src/db/index.js', () => ({
  db: {
    transaction: vi.fn((cb) => cb()),
  },
}));

vi.mock('../../../src/services/email.service.js', () => ({
  emailService: {
    send: vi.fn(),
  },
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('InviteService Unit Tests', () => {
  const MOCK_NOW = new Date('2026-06-23T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createOrgInvite', () => {
    const payload = { email: 'invitee@example.com', role: 'member' as const };
    const callerId = 'caller_125';

    it('should throw 400 HTTPException if the caller user profile cannot be found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

      await expect(createOrgInvite(callerId, payload, mockLogger)).rejects.toThrowError(
        new HTTPException(400, { message: 'Caller is not associated with any organization' }),
      );
    });

    it('should throw 400 HTTPException if the caller does not have an active organizationId', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        id: callerId,
        organizationId: null,
      } as any);

      await expect(createOrgInvite(callerId, payload, mockLogger)).rejects.toThrowError(
        new HTTPException(400, { message: 'Caller is not associated with any organization' }),
      );
    });

    it('should successfully save invite with a 7-day expiration and send a notification email', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        id: callerId,
        organizationId: 'org_abc123',
      } as any);

      vi.mocked(emailService.send).mockResolvedValueOnce({
        success: true,
      });

      const result = await createOrgInvite(callerId, payload, mockLogger);

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();

      const expectedExpiration = new Date(MOCK_NOW);
      expectedExpiration.setDate(expectedExpiration.getDate() + 7);

      expect(inviteRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: payload.email,
          orgId: 'org_abc123',
          role: payload.role,
          expiresAt: expectedExpiration,
        }),
      );

      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: payload.email,
          subject: expect.any(String),
          text: expect.any(String),
        }),
        mockLogger,
      );
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw 502 HTTPException and log errors if EmailService delivery fails', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        id: callerId,
        organizationId: 'org_abc123',
      } as any);

      vi.mocked(emailService.send).mockResolvedValueOnce({
        success: false,
        error: new Error('API key invalidated or daily quota limit breached'),
      });

      await expect(createOrgInvite(callerId, payload, mockLogger)).rejects.toThrowError(
        new HTTPException(502, { message: 'Failed to send invite email' }),
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('acceptOrgInvite', () => {
    const payload = { email: 'accept@example.com', code: 'SEC_CODE', orgId: 'org_id' };
    const mockInvite = {
      id: 'invite_999',
      email: 'accept@example.com',
      code: 'SEC_CODE',
      orgId: 'org_id',
      role: 'admin' as const,
      createdAt: new Date('2026-06-21T12:00:00Z'),
      expiresAt: new Date('2026-06-30T12:00:00Z'),
    };

    it('should throw 400 HTTPException if details do not match a valid invite record', async () => {
      vi.mocked(inviteRepository.findValidInvite).mockResolvedValueOnce(null);

      await expect(acceptOrgInvite(payload, mockLogger)).rejects.toThrowError(
        new HTTPException(400, { message: 'Invalid code, email, or organization credentials' }),
      );
    });

    it('should throw 400 HTTPException if the system time is past the invite expiration timestamp', async () => {
      const expiredInvite = {
        ...mockInvite,
        createdAt: new Date('2026-06-21T12:00:00Z'),
        expiresAt: new Date('2026-06-22T12:00:00Z'),
      };
      vi.mocked(inviteRepository.findValidInvite).mockResolvedValueOnce(expiredInvite);

      await expect(acceptOrgInvite(payload, mockLogger)).rejects.toThrowError(
        new HTTPException(400, { message: 'The invitation has expired' }),
      );
    });

    it('should throw 404 HTTPException if user profile cannot be located by email', async () => {
      vi.mocked(inviteRepository.findValidInvite).mockResolvedValueOnce(mockInvite);
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

      await expect(acceptOrgInvite(payload, mockLogger)).rejects.toThrowError(
        new HTTPException(404, {
          message: 'User profile not found. Please register an account first.',
        }),
      );
    });

    it('should process atomic updates via transaction blocks and clear the invitation row on success', async () => {
      vi.mocked(inviteRepository.findValidInvite).mockResolvedValueOnce(mockInvite);
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce({ id: 'user_joined_99' } as any);

      const result = await acceptOrgInvite(payload, mockLogger);

      expect(result).toEqual({ success: true });
      expect(db.transaction).toHaveBeenCalled();
      expect(userRepository.updateOrgAndRole).toHaveBeenCalledWith(
        'user_joined_99',
        mockInvite.orgId,
        mockInvite.role,
      );
      expect(inviteRepository.deleteById).toHaveBeenCalledWith(mockInvite.id);
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('clearExpiredInvites', () => {
    it('should pass current mock date reference and return cleanup metrics', async () => {
      vi.mocked(inviteRepository.deleteExpired).mockResolvedValueOnce(5);

      const count = await clearExpiredInvites();

      expect(count).toBe(5);
      expect(inviteRepository.deleteExpired).toHaveBeenCalledWith(MOCK_NOW);
    });
  });
});
