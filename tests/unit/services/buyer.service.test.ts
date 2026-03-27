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
    it('should correctly transform repository data', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce([
        {
          sellerId: 'seller_123',
          name: 'Test Farm',
          address: '123 Farm Way',
          city: 'Chicago', // New column
          produceTypesOrdered: ['spinach'],
          amountThisMonthOz: 16,
          firstOrderDate: tenDaysAgo,
        },
      ]);

      const result = await getGrowersForBuyer('buyer_123', 20, 0);

      expect(result[0].amountOrderedThisMonthLbs).toBe(1);
      expect(result[0].daysSinceFirstOrder).toBe(10);
    });
  });

  describe('getBillingSummary', () => {
    it('should calculate metrics based on isLocal flag from repository', async () => {
      vi.mocked(buyerRepository.getBuyerWithOrdersForSummary).mockResolvedValueOnce({
        orders: [
          { id: '1', totalAmount: '50.00', totalOz: '32', isLocal: true },
          { id: '2', totalAmount: '30.00', totalOz: '16', isLocal: true },
          { id: '3', totalAmount: '20.00', totalOz: '16', isLocal: false },
        ],
      });

      const summary = await getBillingSummary('buyer_test');

      expect(summary.totalSpent).toBe(100);
      expect(summary.totalProduceLbs).toBe(4); // (32+16+16)/16
      expect(summary.localSourcingPercentage).toBe(66.67); // 2 out of 3 local
    });

    it('should return zeroes if buyer has no orders', async () => {
      vi.mocked(buyerRepository.getBuyerWithOrdersForSummary).mockResolvedValueOnce({
        orders: [],
      });

      const summary = await getBillingSummary('buyer_empty');
      expect(summary.totalSpent).toBe(0);
      expect(summary.localSourcingPercentage).toBe(0);
    });
  });
});
