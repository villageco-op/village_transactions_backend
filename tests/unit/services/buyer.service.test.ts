import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getGrowersForBuyer } from '../../../src/services/buyer.service.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';

vi.mock('../../../src/repositories/buyer.repository.js', () => ({
  buyerRepository: {
    getGrowersByBuyerId: vi.fn(),
  },
}));

describe('BuyerService - getGrowersForBuyer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly transform repository data (convert oz to lbs, calculate days)', async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce([
      {
        sellerId: 'seller_123',
        name: 'Test Farm',
        address: '123 Farm Way',
        produceTypesOrdered: ['spinach', 'carrots'],
        amountThisMonthOz: 40,
        firstOrderDate: tenDaysAgo,
      },
    ]);

    const result = await getGrowersForBuyer('buyer_123', 20, 0);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        sellerId: 'seller_123',
        name: 'Test Farm',
        address: '123 Farm Way',
        produceTypesOrdered: ['spinach', 'carrots'],
        amountOrderedThisMonthLbs: 2.5,
        daysSinceFirstOrder: 10,
        firstOrderDate: tenDaysAgo.toISOString(),
      }),
    );
  });

  it('should handle null values gracefully', async () => {
    vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce([
      {
        sellerId: 'seller_999',
        name: null,
        address: null,
        produceTypesOrdered: [],
        amountThisMonthOz: '',
        firstOrderDate: new Date(),
      },
    ]);

    const result = await getGrowersForBuyer('buyer_999', 20, 0);

    expect(result).toHaveLength(1);
    expect(result[0].produceTypesOrdered).toEqual([]);
    expect(result[0].amountOrderedThisMonthLbs).toBe(0);
    expect(result[0].daysSinceFirstOrder).toBe(0);
  });

  it('should return an empty array if buyer has no growers', async () => {
    vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce([]);

    const result = await getGrowersForBuyer('buyer_new', 20, 0);

    expect(result).toEqual([]);
  });
});
