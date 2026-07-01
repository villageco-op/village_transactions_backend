import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { del } from '@vercel/blob';

import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  checkSubdomainAvailability,
  removeUserFromOrganization,
  updateUserRoleInOrganization,
} from '../../../src/services/organization.service.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { removeOrganizationFromUsers } from '../../../src/services/user.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { emailService } from '../../../src/services/email.service.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';

vi.mock('@vercel/blob', () => ({
  del: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/repositories/organization.repository.js', () => ({
  organizationRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findBySubdomain: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updateOrgAndRole: vi.fn(),
    removeFromOrganization: vi.fn(),
  },
}));

vi.mock('../../../src/services/user.service.js', () => ({
  removeOrganizationFromUsers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/email.service.js', () => ({
  emailService: {
    send: vi.fn(),
  },
}));

vi.mock('../../../src/services/notification.service.js', () => ({
  sendPushNotification: vi.fn(),
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('OrganizationService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrganization', () => {
    const basePayload = {
      name: 'Madison Pantry',
      type: 'pantry' as const,
      subdomain: 'madison-pantry',
      address: '123 Main St',
      city: 'Madison',
      state: 'WI',
      country: 'United States',
      zip: '53703',
      lat: 43.0731,
      lng: -89.4012,
    };

    it('should successfully create an organization when input data and subdomain are valid', async () => {
      const mockResult = { id: 'org_123', ...basePayload };
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce(null);
      vi.mocked(organizationRepository.create).mockResolvedValueOnce(mockResult as any);

      const result = await createOrganization(basePayload, mockLogger);

      expect(result).toEqual(mockResult);
      expect(organizationRepository.findBySubdomain).toHaveBeenCalledWith('madison-pantry');
      expect(organizationRepository.create).toHaveBeenCalledWith({
        ...basePayload,
        subDomainOverride: 'madison-pantry',
      });
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should normalize, lowercase, and trim the subdomain before processing', async () => {
      const messyPayload = { ...basePayload, subdomain: '  MADISON-pantry  ' };
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce(null);
      vi.mocked(organizationRepository.create).mockResolvedValueOnce({ id: 'org_123' } as any);

      await createOrganization(messyPayload, mockLogger);

      expect(organizationRepository.findBySubdomain).toHaveBeenCalledWith('madison-pantry');
      expect(organizationRepository.create).toHaveBeenCalledWith({
        ...messyPayload,
        subDomainOverride: 'madison-pantry',
      });
    });

    it('should throw a 400 HTTPException if the subdomain format is invalid', async () => {
      const invalidPayload = { ...basePayload, subdomain: 'invalid_subdomain!' };

      await expect(createOrganization(invalidPayload, mockLogger)).rejects.toThrowError(
        new HTTPException(400, { message: 'Invalid subdomain format' }),
      );
      expect(organizationRepository.create).not.toHaveBeenCalled();
    });

    it('should throw a 409 HTTPException if the subdomain is already taken', async () => {
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce({
        id: 'existing_org',
      } as any);

      await expect(createOrganization(basePayload, mockLogger)).rejects.toThrowError(
        new HTTPException(409, { message: 'Subdomain already in use' }),
      );
      expect(organizationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOrganization', () => {
    const existingOrg = {
      id: 'org_123',
      name: 'Old Name',
      subdomain: 'old-sub',
      image: 'https://blob.vercel.com/old-image.png',
    };

    it('should throw a 404 HTTPException if the organization does not exist', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(null);

      await expect(
        updateOrganization('org_none', { name: 'New Name' }, mockLogger),
      ).rejects.toThrowError(new HTTPException(404, { message: 'Organization not found' }));
    });

    it('should successfully update text fields and skip subdomain/location updates if omitted', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce({
        ...existingOrg,
        name: 'New Name',
      } as any);

      const result = await updateOrganization('org_123', { name: 'New Name' }, mockLogger);

      expect(result.name).toBe('New Name');
      expect(organizationRepository.updateById).toHaveBeenCalledWith('org_123', {
        name: 'New Name',
      });
    });

    it('should validate and process a new subdomain if it is changed and available', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce(null);
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce({
        ...existingOrg,
        subdomain: 'new-sub',
      } as any);

      await updateOrganization('org_123', { subdomain: '  NEW-sub  ' }, mockLogger);

      expect(organizationRepository.findBySubdomain).toHaveBeenCalledWith('new-sub');
      expect(organizationRepository.updateById).toHaveBeenCalledWith('org_123', {
        subdomain: 'new-sub',
      });
    });

    it('should allow using the same subdomain if it belongs to the current organization', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce(existingOrg as any); // belongs to org_123
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce(existingOrg as any);

      await expect(
        updateOrganization('org_123', { subdomain: 'old-sub' }, mockLogger),
      ).resolves.toBeDefined();
    });

    it('should throw a 409 HTTPException if another organization has the requested subdomain', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce({
        id: 'other_org',
      } as any);

      await expect(
        updateOrganization('org_123', { subdomain: 'taken-sub' }, mockLogger),
      ).rejects.toThrowError(new HTTPException(409, { message: 'Subdomain already in use' }));
    });

    it('should throw a 400 HTTPException if any location field is provided but components are incomplete', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);

      const incompleteLocation = {
        address: '123 Main St',
        city: 'Madison',
        state: 'WI',
        country: 'USA',
        zip: '53703',
      };

      await expect(
        updateOrganization('org_123', incompleteLocation, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(400, {
          message:
            'All physical location components (address, city, state, country, zip, lat, and lng) must be updated together.',
        }),
      );
    });

    it('should successfully update location details when all elements are provided', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      const fullLocation = {
        address: '123 Main St',
        city: 'Madison',
        state: 'WI',
        country: 'USA',
        zip: '53703',
        lat: 43.0,
        lng: -89.4,
      };
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce({
        ...existingOrg,
        ...fullLocation,
      } as any);

      await updateOrganization('org_123', fullLocation, mockLogger);

      expect(organizationRepository.updateById).toHaveBeenCalledWith('org_123', fullLocation);
    });

    it('should trigger asynchronous deletion of the old Vercel Blob file if a new image URL is supplied', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce({
        ...existingOrg,
        image: 'https://blob.vercel.com/new.png',
      } as any);

      await updateOrganization('org_123', { image: 'https://blob.vercel.com/new.png' }, mockLogger);

      expect(del).toHaveBeenCalledWith(existingOrg.image);
    });

    it('should throw a 500 HTTPException if the repository fails to execute the update payload', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.updateById).mockResolvedValueOnce(null);

      await expect(
        updateOrganization('org_123', { name: 'Fail please' }, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to update organization details' }),
      );
    });
  });

  describe('deleteOrganization', () => {
    const existingOrg = {
      id: 'org_123',
      name: 'To Delete',
      image: 'https://blob.vercel.com/delete-me.png',
    };

    it('should throw a 404 HTTPException if trying to delete an unmapped organization', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(null);

      await expect(deleteOrganization('org_none', mockLogger)).rejects.toThrowError(
        new HTTPException(404, { message: 'Organization not found' }),
      );

      expect(removeOrganizationFromUsers).not.toHaveBeenCalled();
      expect(organizationRepository.deleteById).not.toHaveBeenCalled();
    });

    it('should disassociate users, delete the organization, and invoke Vercel blob cleanup when repository delete succeeds', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.deleteById).mockResolvedValueOnce(true);

      await deleteOrganization('org_123', mockLogger);

      expect(removeOrganizationFromUsers).toHaveBeenCalledWith('org_123', mockLogger);

      expect(organizationRepository.deleteById).toHaveBeenCalledWith('org_123');
      expect(del).toHaveBeenCalledWith(existingOrg.image);
      expect(mockLogger.info).toHaveBeenCalledWith({ orgId: 'org_123' }, expect.any(String));
    });

    it('should still call user disassociation but throw a 500 HTTPException if the repository fails to drop the record', async () => {
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(existingOrg as any);
      vi.mocked(organizationRepository.deleteById).mockResolvedValueOnce(false);

      await expect(deleteOrganization('org_123', mockLogger)).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to delete organization' }),
      );

      expect(removeOrganizationFromUsers).toHaveBeenCalledWith('org_123', mockLogger);
      expect(organizationRepository.deleteById).toHaveBeenCalledWith('org_123');
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe('checkSubdomainAvailability', () => {
    it('should throw a 400 HTTPException if subdomain format violates specifications', async () => {
      await expect(checkSubdomainAvailability('bad_format!')).rejects.toThrowError(
        new HTTPException(400, { message: 'Invalid subdomain format' }),
      );
    });

    it('should return available: true if the subdomain is entirely unclaimed', async () => {
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValueOnce(null);

      const result = await checkSubdomainAvailability('fresh-pantry');

      expect(result).toEqual({ available: true });
      expect(organizationRepository.findBySubdomain).toHaveBeenCalledWith('fresh-pantry');
    });

    it('should suggest an incremented suffix alternative if the primary subdomain is taken', async () => {
      vi.mocked(organizationRepository.findBySubdomain)
        .mockResolvedValueOnce({ id: 'colliding_id' } as any) // for 'test-org'
        .mockResolvedValueOnce(null); // for 'test-org1'

      const result = await checkSubdomainAvailability('test-org');

      expect(result).toEqual({ available: false, suggestion: 'test-org1' });
      expect(organizationRepository.findBySubdomain).toHaveBeenCalledTimes(2);
    });

    it('should continue looping sequentially until a completely unique alternate variation is found', async () => {
      vi.mocked(organizationRepository.findBySubdomain)
        .mockResolvedValueOnce({ id: '1' } as any) // original
        .mockResolvedValueOnce({ id: '2' } as any) // original1
        .mockResolvedValueOnce({ id: '3' } as any) // original2
        .mockResolvedValueOnce(null); // original3

      const result = await checkSubdomainAvailability('original');

      expect(result).toEqual({ available: false, suggestion: 'original3' });
      expect(organizationRepository.findBySubdomain).toHaveBeenCalledTimes(4);
    });

    it('should throw a 500 HTTPException if loop optimization protections trip over 100 iterations', async () => {
      vi.mocked(organizationRepository.findBySubdomain).mockResolvedValue({
        id: 'eternal-blocker',
      } as any);

      await expect(checkSubdomainAvailability('infinite')).rejects.toThrowError(
        new HTTPException(500, { message: 'Unable to generate a unique subdomain suggestion' }),
      );
    });
  });

  describe('removeUserFromOrganization', () => {
    const callerId = 'admin_caller';
    const targetUserId = 'target_user_123';
    const orgId = 'org_abc123';

    const mockAdminCaller = { id: callerId, orgRole: 'admin', organizationId: orgId };
    const mockTargetUser = {
      id: targetUserId,
      organizationId: orgId,
      email: 'target@example.com',
      name: 'John Doe',
    };
    const mockOrg = { id: orgId, name: 'Test Org' };

    it('should successfully remove a user, send email, and send a push notification', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any) // caller check
        .mockResolvedValueOnce(mockTargetUser as any); // target check

      vi.mocked(userRepository.removeFromOrganization).mockResolvedValueOnce({
        id: targetUserId,
      } as any);
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(mockOrg as any);
      vi.mocked(emailService.send).mockResolvedValueOnce({ success: true });
      vi.mocked(sendPushNotification).mockResolvedValueOnce(undefined as any);

      const result = await removeUserFromOrganization(callerId, targetUserId, mockLogger);

      expect(result).toEqual({ success: true });
      expect(userRepository.removeFromOrganization).toHaveBeenCalledWith(targetUserId);
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'target@example.com',
          subject: 'Membership ended at Test Org',
        }),
        mockLogger,
      );
      expect(sendPushNotification).toHaveBeenCalledWith(
        targetUserId,
        'Organization Update',
        'You have been removed from Test Org',
        mockLogger,
      );
    });

    it('should throw 401 if caller is not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

      await expect(
        removeUserFromOrganization(callerId, targetUserId, mockLogger),
      ).rejects.toThrowError(new HTTPException(401, { message: 'Caller not found' }));
    });

    it('should throw 403 if caller is not an admin', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        ...mockAdminCaller,
        orgRole: 'member',
      } as any);

      await expect(
        removeUserFromOrganization(callerId, targetUserId, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(403, { message: 'Insufficient organization permissions' }),
      );
    });

    it('should throw 404 if target user is not found', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(null);

      await expect(
        removeUserFromOrganization(callerId, targetUserId, mockLogger),
      ).rejects.toThrowError(new HTTPException(404, { message: 'Target user not found' }));
    });

    it('should throw 403 if target user belongs to a different organization', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce({ ...mockTargetUser, organizationId: 'different_org' } as any);

      await expect(
        removeUserFromOrganization(callerId, targetUserId, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(403, { message: 'User does not belong to your organization' }),
      );
    });

    it('should throw 500 if database operation to remove user fails', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(mockTargetUser as any);
      vi.mocked(userRepository.removeFromOrganization).mockResolvedValueOnce(null);

      await expect(
        removeUserFromOrganization(callerId, targetUserId, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to disassociate user from organization' }),
      );
    });

    it('should catch push notification failure gracefully and log an error', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(mockTargetUser as any);
      vi.mocked(userRepository.removeFromOrganization).mockResolvedValueOnce({
        id: targetUserId,
      } as any);
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(mockOrg as any);
      vi.mocked(emailService.send).mockResolvedValueOnce({ success: true });
      vi.mocked(sendPushNotification).mockRejectedValueOnce(new Error('Push gateway down'));

      const result = await removeUserFromOrganization(callerId, targetUserId, mockLogger);

      expect(result).toEqual({ success: true });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Push gateway down' }),
        'Failed to dispatch push notification',
      );
    });
  });

  describe('updateUserRoleInOrganization', () => {
    const callerId = 'admin_caller';
    const targetUserId = 'target_user_123';
    const orgId = 'org_abc123';
    const newRole = 'admin';

    const mockAdminCaller = { id: callerId, orgRole: 'admin', organizationId: orgId };
    const mockTargetUser = {
      id: targetUserId,
      organizationId: orgId,
      email: 'target@example.com',
      name: 'John Doe',
    };
    const mockOrg = { id: orgId, name: 'Test Org' };
    const mockUpdatedUser = { ...mockTargetUser, orgRole: newRole };

    it('should successfully update role, send email, and dispatch push notification', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(mockTargetUser as any);

      vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(mockUpdatedUser as any);
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(mockOrg as any);
      vi.mocked(emailService.send).mockResolvedValueOnce({ success: true });
      vi.mocked(sendPushNotification).mockResolvedValueOnce(undefined as any);

      const result = await updateUserRoleInOrganization(
        callerId,
        targetUserId,
        newRole,
        mockLogger,
      );

      expect(result).toEqual(mockUpdatedUser);
      expect(userRepository.updateOrgAndRole).toHaveBeenCalledWith(targetUserId, orgId, newRole);
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'target@example.com',
          subject: 'Role Updated in Test Org',
        }),
        mockLogger,
      );
      expect(sendPushNotification).toHaveBeenCalledWith(
        targetUserId,
        'Role Updated',
        `Your role in Test Org has been updated to ${newRole}`,
        mockLogger,
      );
    });

    it('should throw 401 if caller profile is missing', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

      await expect(
        updateUserRoleInOrganization(callerId, targetUserId, newRole, mockLogger),
      ).rejects.toThrowError(new HTTPException(401, { message: 'Caller not found' }));
    });

    it('should throw 403 if caller lacks proper permissions', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        ...mockAdminCaller,
        orgRole: 'member',
      } as any);

      await expect(
        updateUserRoleInOrganization(callerId, targetUserId, newRole, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(403, { message: 'Insufficient organization permissions' }),
      );
    });

    it('should throw 404 if target user cannot be found', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(null);

      await expect(
        updateUserRoleInOrganization(callerId, targetUserId, newRole, mockLogger),
      ).rejects.toThrowError(new HTTPException(404, { message: 'Target user not found' }));
    });

    it('should throw 403 if target user is in a different org structure', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce({ ...mockTargetUser, organizationId: 'external_org_id' } as any);

      await expect(
        updateUserRoleInOrganization(callerId, targetUserId, newRole, mockLogger),
      ).rejects.toThrowError(
        new HTTPException(403, { message: 'User does not belong to your organization' }),
      );
    });

    it('should throw 500 if repository role update routine fails', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(mockTargetUser as any);
      vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(null);

      await expect(
        updateUserRoleInOrganization(callerId, targetUserId, newRole, mockLogger),
      ).rejects.toThrowError(new HTTPException(500, { message: 'Failed to update user role' }));
    });

    it('should catch push notification error gracefully and return updated target structure', async () => {
      vi.mocked(userRepository.findById)
        .mockResolvedValueOnce(mockAdminCaller as any)
        .mockResolvedValueOnce(mockTargetUser as any);
      vi.mocked(userRepository.updateOrgAndRole).mockResolvedValueOnce(mockUpdatedUser as any);
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce(mockOrg as any);
      vi.mocked(emailService.send).mockResolvedValueOnce({ success: true });
      vi.mocked(sendPushNotification).mockRejectedValueOnce('Network Timeout');

      const result = await updateUserRoleInOrganization(
        callerId,
        targetUserId,
        newRole,
        mockLogger,
      );

      expect(result).toEqual(mockUpdatedUser);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Network Timeout' }),
        'Failed to dispatch push notification',
      );
    });
  });
});
