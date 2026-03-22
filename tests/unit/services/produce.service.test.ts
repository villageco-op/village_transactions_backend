import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createProduceListing,
  deleteProduceListing,
  getProduceList,
  updateProduceListing,
} from '../../../src/services/produce.service.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    getList: vi.fn(),
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

describe('ProduceService - getProduceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format repository results, extracting the thumbnail and parsing distance', async () => {
    const mockDbDate = new Date();
    const mockRepoResponse = [
      {
        id: 'prod_1',
        name: 'Apples',
        price: '0.50',
        amount: '100',
        images: ['https://example.com/apple1.jpg', 'https://example.com/apple2.jpg'],
        isSubscribable: true,
        availableBy: mockDbDate,
        sellerId: 'user_1',
        sellerName: 'Farmer Bob',
        distance: '5.234', // simulated PG string or number return
      },
      {
        id: 'prod_2',
        name: 'Oranges',
        price: '0.75',
        amount: '50',
        images: [], // No images case
        isSubscribable: false,
        availableBy: mockDbDate,
        sellerId: 'user_2',
        sellerName: 'Farmer Jane',
        distance: '10.5',
      },
    ];

    vi.mocked(produceRepository.getList).mockResolvedValueOnce(mockRepoResponse as any);

    const result = await getProduceList({
      lat: 40.0,
      lng: -70.0,
      limit: 20,
      offset: 0,
    });

    // Check parameters passed to repo
    expect(produceRepository.getList).toHaveBeenCalledWith({
      lat: 40.0,
      lng: -70.0,
      limit: 20,
      offset: 0,
    });

    // Verify first item mapping (has images)
    expect(result[0]).toEqual({
      id: 'prod_1',
      name: 'Apples',
      price: '0.50',
      amount: '100',
      isSubscribable: true,
      availableBy: mockDbDate,
      sellerId: 'user_1',
      sellerName: 'Farmer Bob',
      distance: 5.234, // Converted to number
      thumbnail: 'https://example.com/apple1.jpg', // Extracted first image
    });

    // Verify second item mapping (no images)
    expect(result[1]).toEqual({
      id: 'prod_2',
      name: 'Oranges',
      price: '0.75',
      amount: '50',
      isSubscribable: false,
      availableBy: mockDbDate,
      sellerId: 'user_2',
      sellerName: 'Farmer Jane',
      distance: 10.5,
      thumbnail: null, // Null when empty
    });
  });
});
