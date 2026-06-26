import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { del } from '@vercel/blob';

import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  checkSubdomainAvailability,
} from '../../../src/services/organization.service.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';
import { removeOrganizationFromUsers } from '../../../src/services/user.service.js';

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

vi.mock('../../../src/services/user.service.js', () => ({
  removeOrganizationFromUsers: vi.fn().mockResolvedValue(undefined),
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
});
