import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSellerEarningsMetrics } from '../../../src/services/seller.service.js';
import { sellerRepository } from '../../../src/repositories/seller.repository.js';

vi.mock('../../../src/repositories/seller.repository.js', () => ({
  sellerRepository: {
    getEarningsMetrics: vi.fn(),
  },
}));

describe('SellerService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSellerEarningsMetrics', () => {
    it('should correctly calculate earnings metrics from repository data', async () => {
      vi.mocked(sellerRepository.getEarningsMetrics).mockResolvedValueOnce({
        goal: '2000.00',
        aggregates: {
          earnedThisMonth: '850.50',
          earnedLastMonth: '600.00',
          totalEarnedYTD: '3450.00',
          totalEarnedLifetime: '8000.00',
        },
        weightAgg: {
          totalOzLifetime: '3200', // 200 lbs
        },
        produceSalesThisMonth: [
          { produceName: 'Apples', amount: '450.00' },
          { produceName: 'Carrots', amount: '400.50' },
        ],
      });

      const result = await getSellerEarningsMetrics('seller_abc');

      expect(result.monthlyGoal).toBe(2000);
      expect(result.earnedThisMonth).toBe(850.5);
      expect(result.earnedLastMonth).toBe(600);
      expect(result.remainingToGoal).toBe(1149.5); // 2000 - 850.5
      expect(result.totalEarnedYTD).toBe(3450);
      expect(result.avgPerLbSold).toBe(40); // 8000 / 200 lbs
      expect(result.amountSoldDollarsPerProduceThisMonth).toHaveLength(2);
      expect(result.amountSoldDollarsPerProduceThisMonth[0].produceName).toBe('Apples');
      expect(result.amountSoldDollarsPerProduceThisMonth[0].amount).toBe(450);
    });

    it('should handle zero and null values securely', async () => {
      vi.mocked(sellerRepository.getEarningsMetrics).mockResolvedValueOnce({
        goal: null,
        aggregates: {
          earnedThisMonth: null,
          earnedLastMonth: null,
          totalEarnedYTD: null,
          totalEarnedLifetime: null,
        },
        weightAgg: {
          totalOzLifetime: null,
        },
        produceSalesThisMonth: [],
      });

      const result = await getSellerEarningsMetrics('seller_empty');

      expect(result.monthlyGoal).toBe(0);
      expect(result.earnedThisMonth).toBe(0);
      expect(result.remainingToGoal).toBe(0); // Max of (0 - 0)
      expect(result.avgPerLbSold).toBe(0); // Should not divide by 0
      expect(result.totalEarnedYTD).toBe(0);
      expect(result.amountSoldDollarsPerProduceThisMonth).toEqual([]);
    });
  });
});
