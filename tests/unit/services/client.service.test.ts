import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  createClient,
  getClients,
  updateClient,
  deactivateClient,
  deleteClient,
  searchReferrerCandidates,
  getClientReferrals,
} from '../../../src/services/client.service.js';
import { clientRepository } from '../../../src/repositories/client.repository.js';
import { UpdateClientPayload } from '../../../src/schemas/client.schema.js';

vi.mock('../../../src/repositories/client.repository.js', () => ({
  clientRepository: {
    create: vi.fn(),
    findExactMatches: vi.fn(),
    findFuzzyCandidates: vi.fn(),
    createReferral: vi.fn(),
    getList: vi.fn(),
    findReferredBy: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    setActiveStatus: vi.fn(),
    delete: vi.fn(),
    getReferralsList: vi.fn(),
  },
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('ClientService Unit Tests', () => {
  const MOCK_NOW = new Date('2026-07-18T12:00:00Z');
  const userId = 'user-123';
  const orgId = 'org-456';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createClient', () => {
    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St',
    };

    const mockCreatedClient = {
      id: 'client-abc',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St',
      city: 'Town',
      state: 'WI',
      country: 'USA',
      zip: '51123',
      active: true,
      organizationId: orgId,
      createdById: userId,
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
    };

    it('should create a client without referral setup when no referrerId is provided', async () => {
      vi.mocked(clientRepository.create).mockResolvedValueOnce(mockCreatedClient);

      const result = await createClient(userId, orgId, payload, mockLogger);

      expect(clientRepository.create).toHaveBeenCalledWith({
        ...payload,
        organizationId: orgId,
        createdById: userId,
      });
      expect(clientRepository.findById).not.toHaveBeenCalled();
      expect(result).toEqual({ ...mockCreatedClient, referredBy: null });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { name: payload.name, orgId },
        expect.any(String),
      );
    });

    it('should link referral correctly if a matching explicit referrerId is found', async () => {
      const payloadWithReferrer = { ...payload, referrerId: 'referrer-uuid' };
      const mockReferrer = {
        id: 'referrer-uuid',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '555-9999',
      } as any;

      vi.mocked(clientRepository.create).mockResolvedValueOnce(mockCreatedClient);
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(mockReferrer);
      vi.mocked(clientRepository.createReferral).mockResolvedValueOnce({} as any);

      const result = await createClient(userId, orgId, payloadWithReferrer, mockLogger);

      expect(clientRepository.findById).toHaveBeenCalledWith('referrer-uuid', orgId);
      expect(clientRepository.createReferral).toHaveBeenCalledWith(
        mockReferrer.id,
        mockCreatedClient.id,
      );
      expect(result.referredBy).toEqual({
        id: mockReferrer.id,
        name: mockReferrer.name,
        email: mockReferrer.email,
        phone: mockReferrer.phone,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { referrerId: mockReferrer.id, referredId: mockCreatedClient.id },
        expect.any(String),
      );
    });

    it('should log a warning and return null for referredBy if referrerId is specified but not found', async () => {
      const payloadWithReferrer = { ...payload, referrerId: 'missing-uuid' };

      vi.mocked(clientRepository.create).mockResolvedValueOnce(mockCreatedClient);
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(null as any);

      const result = await createClient(userId, orgId, payloadWithReferrer, mockLogger);

      expect(clientRepository.createReferral).not.toHaveBeenCalled();
      expect(result.referredBy).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { referrerId: 'missing-uuid' },
        expect.any(String),
      );
    });
  });

  describe('searchReferrerCandidates', () => {
    const queryStr = '  test-query  ';
    const mockClient = {
      id: 'client-1',
      name: 'Test Client',
      email: 'test@example.com',
      phone: '123-4567',
    };

    it('should return exactMatch true when exactly one exact match is found', async () => {
      vi.mocked(clientRepository.findExactMatches).mockResolvedValueOnce([mockClient]);

      const result = await searchReferrerCandidates(orgId, queryStr, mockLogger);

      expect(clientRepository.findExactMatches).toHaveBeenCalledWith(orgId, 'test-query');
      expect(clientRepository.findFuzzyCandidates).not.toHaveBeenCalled();
      expect(result).toEqual({
        exactMatch: true,
        results: [mockClient],
      });
    });

    it('should fall back to fuzzy matching when no exact matches are found', async () => {
      vi.mocked(clientRepository.findExactMatches).mockResolvedValueOnce([]);
      vi.mocked(clientRepository.findFuzzyCandidates).mockResolvedValueOnce([mockClient]);

      const result = await searchReferrerCandidates(orgId, queryStr, mockLogger);

      expect(clientRepository.findExactMatches).toHaveBeenCalledWith(orgId, 'test-query');
      expect(clientRepository.findFuzzyCandidates).toHaveBeenCalledWith(orgId, 'test-query');
      expect(result).toEqual({
        exactMatch: false,
        results: [mockClient],
      });
    });

    it('should fall back to fuzzy matching when multiple exact matches are found', async () => {
      const mockClient2 = { ...mockClient, id: 'client-2' };
      vi.mocked(clientRepository.findExactMatches).mockResolvedValueOnce([mockClient, mockClient2]);
      vi.mocked(clientRepository.findFuzzyCandidates).mockResolvedValueOnce([
        mockClient,
        mockClient2,
      ]);

      const result = await searchReferrerCandidates(orgId, queryStr, mockLogger);

      expect(clientRepository.findExactMatches).toHaveBeenCalledWith(orgId, 'test-query');
      expect(clientRepository.findFuzzyCandidates).toHaveBeenCalledWith(orgId, 'test-query');
      expect(result).toEqual({
        exactMatch: false,
        results: [mockClient, mockClient2],
      });
    });
  });

  describe('getClients', () => {
    const params = { search: 'test', active: true, page: 1, limit: 10, offset: 0 };
    const mockClientItems = [
      {
        id: 'client-1',
        name: 'Client One',
        referralCount: 2,
        referredBy: { id: 'ref-1', name: 'Referrer Name', email: 'r@test.com', phone: '111' },
      },
      {
        id: 'client-2',
        name: 'Client Two',
        referralCount: 0,
        referredBy: null,
      },
    ] as any[];

    it('should return a list of enriched clients with their referral metrics directly from repository', async () => {
      vi.mocked(clientRepository.getList).mockResolvedValueOnce({
        items: mockClientItems,
        total: 2,
      });

      const result = await getClients(orgId, params, mockLogger);

      expect(clientRepository.getList).toHaveBeenCalledWith({
        orgId,
        search: params.search,
        active: params.active,
        limit: params.limit,
        offset: params.offset,
      });
      // Ensure findReferredBy is NOT called anymore due to single query optimization
      expect(clientRepository.findReferredBy).not.toHaveBeenCalled();
      expect(result.total).toBe(2);
      expect(result.items).toEqual(mockClientItems);
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('updateClient', () => {
    const id = 'client-id';
    const payload: UpdateClientPayload = { name: 'Updated Name' };

    it('should throw a 404 HTTPException if the client entity does not exist', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(null as any);

      await expect(updateClient(id, orgId, payload, mockLogger)).rejects.toThrowError(
        new HTTPException(404, { message: 'Client not found' }),
      );
    });

    it('should throw a 500 HTTPException if the repository update operation falls short', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.update).mockResolvedValueOnce(null as any);

      await expect(updateClient(id, orgId, payload, mockLogger)).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to update client' }),
      );
    });

    it('should return updated client profile containing enriched referral contexts', async () => {
      const mockUpdated = { id, name: 'Updated Name' } as any;
      const mockReferrer = { id: 'ref-id', name: 'Ref' } as any;

      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.update).mockResolvedValueOnce(mockUpdated);
      vi.mocked(clientRepository.findReferredBy).mockResolvedValueOnce(mockReferrer);

      const result = await updateClient(id, orgId, payload, mockLogger);

      expect(clientRepository.update).toHaveBeenCalledWith(id, orgId, payload);
      expect(clientRepository.findReferredBy).toHaveBeenCalledWith(id);
      expect(result).toEqual({ ...mockUpdated, referredBy: mockReferrer });
      expect(mockLogger.info).toHaveBeenCalledWith({ clientId: id, orgId }, expect.any(String));
    });
  });

  describe('deactivateClient', () => {
    const id = 'client-id';

    it('should throw a 404 HTTPException if target client cannot be verified', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(null as any);

      await expect(deactivateClient(id, orgId, mockLogger)).rejects.toThrowError(
        new HTTPException(404, { message: 'Client not found' }),
      );
    });

    it('should throw a 500 HTTPException if updating active status flag fails', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.setActiveStatus).mockResolvedValueOnce(null as any);

      await expect(deactivateClient(id, orgId, mockLogger)).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to deactivate client' }),
      );
    });

    it('should set active status to false and map related referral contexts cleanly', async () => {
      const mockDeactivated = { id, active: false } as any;
      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.setActiveStatus).mockResolvedValueOnce(mockDeactivated);
      vi.mocked(clientRepository.findReferredBy).mockResolvedValueOnce(null as any);

      const result = await deactivateClient(id, orgId, mockLogger);

      expect(clientRepository.setActiveStatus).toHaveBeenCalledWith(id, orgId, false);
      expect(result).toEqual({ ...mockDeactivated, referredBy: null });
      expect(mockLogger.info).toHaveBeenCalledWith({ clientId: id, orgId }, expect.any(String));
    });
  });

  describe('deleteClient', () => {
    const id = 'client-id';

    it('should throw a 404 HTTPException if the client is missing prior to deletion', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(null as any);

      await expect(deleteClient(id, orgId, mockLogger)).rejects.toThrowError(
        new HTTPException(404, { message: 'Client not found' }),
      );
    });

    it('should throw a 500 HTTPException if database deletion fails', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.delete).mockResolvedValueOnce(false);

      await expect(deleteClient(id, orgId, mockLogger)).rejects.toThrowError(
        new HTTPException(500, { message: 'Failed to remove client record' }),
      );
    });

    it('should delete client successfully from the schema and verify output status', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce({ id } as any);
      vi.mocked(clientRepository.delete).mockResolvedValueOnce(true);

      const result = await deleteClient(id, orgId, mockLogger);

      expect(clientRepository.delete).toHaveBeenCalledWith(id, orgId);
      expect(result).toEqual({ success: true });
      expect(mockLogger.info).toHaveBeenCalledWith({ clientId: id, orgId }, expect.any(String));
    });
  });

  describe('getClientReferrals', () => {
    const referrerId = 'referrer-123';

    it('should throw 404 HTTPException if the referrer client does not exist', async () => {
      vi.mocked(clientRepository.findById).mockResolvedValueOnce(null as any);

      await expect(
        getClientReferrals(referrerId, orgId, { page: 1, limit: 10, offset: 0 }, mockLogger),
      ).rejects.toThrow(new HTTPException(404, { message: 'Referrer client not found' }));

      expect(clientRepository.findById).toHaveBeenCalledWith(referrerId, orgId);
      expect(clientRepository.getReferralsList).not.toHaveBeenCalled();
    });

    it('should retrieve, enrich, and return paginated referrals if the referrer client exists', async () => {
      const mockReferrer = {
        id: referrerId,
        name: 'Alice Referrer',
        email: 'alice@example.com',
        phone: '555-8888',
        organizationId: orgId,
        createdById: userId,
      } as any;

      const mockReferredClients = [
        {
          id: 'referred-1',
          name: 'Bob Referred',
          email: 'bob@example.com',
          phone: '555-1111',
          address: 'Some Address',
          city: 'Town',
          state: 'WI',
          country: 'USA',
          zip: '51123',
          active: true,
          organizationId: orgId,
          createdById: userId,
          createdAt: MOCK_NOW,
          updatedAt: MOCK_NOW,
        },
      ];

      vi.mocked(clientRepository.findById).mockResolvedValueOnce(mockReferrer);
      vi.mocked(clientRepository.getReferralsList).mockResolvedValueOnce({
        items: mockReferredClients,
        total: 1,
      });

      const result = await getClientReferrals(
        referrerId,
        orgId,
        { page: 1, limit: 10, offset: 0 },
        mockLogger,
      );

      expect(clientRepository.findById).toHaveBeenCalledWith(referrerId, orgId);
      expect(clientRepository.getReferralsList).toHaveBeenCalledWith({
        referrerId,
        orgId,
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({
        items: [
          {
            ...mockReferredClients[0],
            referredBy: {
              id: mockReferrer.id,
              name: mockReferrer.name,
              email: mockReferrer.email,
              phone: mockReferrer.phone,
            },
          },
        ],
        total: 1,
      });
    });
  });
});
