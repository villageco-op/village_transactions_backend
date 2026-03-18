import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { createProduceListing } from '../../../src/services/produce.service.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    create: vi.fn(),
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
