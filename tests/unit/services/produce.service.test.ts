import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createProduceListing,
  deleteProduceListing,
  updateProduceListing,
} from '../../../src/services/produce.service.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

describe('ProduceService - createProduceListing', () => {
  const mockPayload = {
    title: 'Organic Carrots',
    produceType: 'vegetable',
    pricePerOz: 0.5,
    totalOzInventory: 100,
    harvestFrequencyDays: 7,
    seasonStart: '2024-05-01',
    seasonEnd: '2024-10-31',
    images: ['https://example.com/carrot.jpg'],
    isSubscribable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully create a produce listing and return the created data', async () => {
    const mockDbProduce = {
      id: 'prod_123',
      sellerId: 'user_123',
      title: 'Organic Carrots',
      produceType: 'vegetable',
      pricePerOz: '0.50',
      totalOzInventory: '100',
      harvestFrequencyDays: 7,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/carrot.jpg'],
      isSubscribable: true,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(produceRepository.create).mockResolvedValueOnce(mockDbProduce as any);

    const result = await createProduceListing('user_123', mockPayload);

    expect(result).toEqual(mockDbProduce);
    expect(produceRepository.create).toHaveBeenCalledWith('user_123', mockPayload);
  });

  it('should propagate repository errors upward', async () => {
    const dbError = new Error('Database Timeout');
    vi.mocked(produceRepository.create).mockRejectedValueOnce(dbError);

    await expect(createProduceListing('user_123', mockPayload)).rejects.toThrow('Database Timeout');

    expect(produceRepository.create).toHaveBeenCalledTimes(1);
  });
});

describe('ProduceService - updateProduceListing', () => {
  const mockId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSellerId = 'user_123';
  const mockUpdatePayload = {
    status: 'paused' as const,
    totalOzInventory: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully update a produce listing and return the updated data', async () => {
    const mockUpdatedDbProduce = {
      id: mockId,
      sellerId: mockSellerId,
      title: 'Organic Carrots',
      produceType: 'vegetable',
      pricePerOz: '0.50',
      totalOzInventory: '50',
      harvestFrequencyDays: 7,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/carrot.jpg'],
      isSubscribable: true,
      status: 'paused', // updated field
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(produceRepository.update).mockResolvedValueOnce(mockUpdatedDbProduce as any);

    const result = await updateProduceListing(mockId, mockSellerId, mockUpdatePayload);

    expect(result).toEqual(mockUpdatedDbProduce);
    expect(produceRepository.update).toHaveBeenCalledWith(mockId, mockSellerId, mockUpdatePayload);
  });

  it('should return undefined if listing is not found or unauthorized', async () => {
    vi.mocked(produceRepository.update).mockResolvedValueOnce(undefined);

    const result = await updateProduceListing(mockId, mockSellerId, mockUpdatePayload);

    expect(result).toBeUndefined();
    expect(produceRepository.update).toHaveBeenCalledWith(mockId, mockSellerId, mockUpdatePayload);
  });

  it('should propagate repository errors upward', async () => {
    const dbError = new Error('Database Connection Lost');
    vi.mocked(produceRepository.update).mockRejectedValueOnce(dbError);

    await expect(updateProduceListing(mockId, mockSellerId, mockUpdatePayload)).rejects.toThrow(
      'Database Connection Lost',
    );

    expect(produceRepository.update).toHaveBeenCalledTimes(1);
  });
});

describe('ProduceService - deleteProduceListing', () => {
  const mockId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSellerId = 'user_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully soft delete a produce listing and return true', async () => {
    vi.mocked(produceRepository.softDelete).mockResolvedValueOnce(true);

    const result = await deleteProduceListing(mockId, mockSellerId);

    expect(result).toBe(true);
    expect(produceRepository.softDelete).toHaveBeenCalledWith(mockId, mockSellerId);
  });

  it('should return false if the listing is not found or unauthorized', async () => {
    vi.mocked(produceRepository.softDelete).mockResolvedValueOnce(false);

    const result = await deleteProduceListing(mockId, mockSellerId);

    expect(result).toBe(false);
    expect(produceRepository.softDelete).toHaveBeenCalledWith(mockId, mockSellerId);
  });
});
