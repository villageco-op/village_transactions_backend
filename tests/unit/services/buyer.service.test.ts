import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getBillingSummary, getGrowersForBuyer } from '../../../src/services/buyer.service.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';

vi.mock('../../../src/repositories/buyer.repository.js', () => ({
  buyerRepository: {
    getGrowersByBuyerId: vi.fn(),
    getBuyerWithOrdersForSummary: vi.fn(),
  },
}));

describe('BuyerService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGrowersForBuyer', () => {
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

  describe('getBillingSummary', () => {
    it('should calculate accurate metrics and parse cities successfully', async () => {
      vi.mocked(buyerRepository.getBuyerWithOrdersForSummary).mockResolvedValueOnce({
        buyerAddress: '100 Main St, Chicago, IL 60601',
        orders: [
          {
            id: '1',
            totalAmount: '50.00',
            totalOz: '32',
            sellerAddress: '200 Farm St, Chicago, IL 60605',
          },
          { id: '2', totalAmount: '30.00', totalOz: '16', sellerAddress: 'Chicago, IL' },
          {
            id: '3',
            totalAmount: '100.00',
            totalOz: '112',
            sellerAddress: '123 Apple Orchard, Springfield, IL 62701',
          },
        ],
      });

      const summary = await getBillingSummary('buyer_test');

      expect(summary.totalSpent).toBe(180);
      expect(summary.totalProduceLbs).toBe(10);
      expect(summary.avgCostPerLb).toBe(18);
      expect(summary.localSourcingPercentage).toBe(66.67);
    });

    it('should return zeroes if buyer has no orders', async () => {
      vi.mocked(buyerRepository.getBuyerWithOrdersForSummary).mockResolvedValueOnce({
        buyerAddress: '100 Main St, Chicago, IL',
        orders: [],
      });

      const summary = await getBillingSummary('buyer_test_empty');

      expect(summary).toEqual({
        totalSpent: 0,
        totalProduceLbs: 0,
        avgCostPerLb: 0,
        localSourcingPercentage: 0,
      });
    });

    it('should handle unparseable addresses gracefully (fallback to 0% local)', async () => {
      vi.mocked(buyerRepository.getBuyerWithOrdersForSummary).mockResolvedValueOnce({
        buyerAddress: null,
        orders: [{ id: '1', totalAmount: '10.00', totalOz: '16', sellerAddress: 'Chicago, IL' }],
      });

      const summary = await getBillingSummary('buyer_test_no_addr');

      expect(summary.totalSpent).toBe(10);
      expect(summary.localSourcingPercentage).toBe(0);
    });
  });
});
