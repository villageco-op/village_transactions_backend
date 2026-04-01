import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBillingSummary,
  getGrowersForBuyer,
  getBuyerDashboardMetrics,
} from '../../../src/services/buyer.service.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';

vi.mock('../../../src/repositories/buyer.repository.js', () => ({
  buyerRepository: {
    getGrowersByBuyerId: vi.fn(),
    getBuyerWithOrdersForSummary: vi.fn(),
    getDashboardMetrics: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getActiveSubscriptionsForBuyer: vi.fn(),
  },
}));

describe('BuyerService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGrowersForBuyer', () => {
    it('should correctly transform paginated repository data', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce({
        items: [
          {
            sellerId: 'seller_123',
            name: 'Test Farm',
            address: '123 Farm Way',
            city: 'Chicago',
            produceTypesOrdered: ['spinach'],
            amountThisMonthOz: 16,
            firstOrderDate: tenDaysAgo,
          },
        ],
        total: 25,
      });

      const result = await getGrowersForBuyer('buyer_123', 2, 20, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].amountOrderedThisMonthLbs).toBe(1); // 16 oz = 1 lb
      expect(result.data[0].daysSinceFirstOrder).toBe(10);

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 20,
        totalPages: 2,
      });

      expect(buyerRepository.getGrowersByBuyerId).toHaveBeenCalledWith('buyer_123', 20, 20);
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
      expect(summary.totalProduceLbs).toBe(0);
      expect(summary.localSourcingPercentage).toBe(0);
      expect(summary.avgCostPerLb).toBe(0);
    });
  });

  describe('getBuyerDashboardMetrics', () => {
    it('should correctly aggregate metrics, convert ounces to lbs, and calculate percentages', async () => {
      vi.mocked(buyerRepository.getDashboardMetrics).mockResolvedValueOnce({
        weightAgg: { ozThisWeek: 320, ozLastWeek: 160 },
        spendAgg: { spendThisMonth: 1500, spendLastMonth: 1000 },
        growers: [
          { sellerId: 'id_1', isLocal: true, distance: 10 },
          { sellerId: 'id_2', isLocal: false, distance: 50 },
          { sellerId: 'id_3', isLocal: true, distance: 30 },
        ],
      });

      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([
        { id: 'sub_1', produceName: 'Carrots', amount: '160' },
      ]);

      const metrics = await getBuyerDashboardMetrics('buyer_123');

      expect(metrics.onOrderThisWeekLbs).toBe(20);
      expect(metrics.percentChangeFromLastWeek).toBe(100); // from 10 to 20 is +100%

      expect(metrics.totalSpendThisMonth).toBe(1500);
      expect(metrics.totalSpendLastMonth).toBe(1000);

      expect(metrics.activeSubscriptions).toHaveLength(1);
      expect(metrics.activeSubscriptions[0]).toEqual({
        id: 'sub_1',
        produceName: 'Carrots',
        amount: 10,
      });

      expect(metrics.localGrowersSupplying).toBe(2);
      expect(metrics.furthestGrowerDistanceMiles).toBe(50);
      expect(metrics.avgGrowerDistanceMiles).toBe(30); // (10 + 50 + 30) / 3
    });

    it('should gracefully handle empty or zeroed data', async () => {
      vi.mocked(buyerRepository.getDashboardMetrics).mockResolvedValueOnce({
        weightAgg: { ozThisWeek: 0, ozLastWeek: 0 },
        spendAgg: { spendThisMonth: 0, spendLastMonth: 0 },
        growers: [{ sellerId: 'id_1', isLocal: false, distance: null }],
      });

      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([]);

      const metrics = await getBuyerDashboardMetrics('buyer_zero');

      expect(metrics.onOrderThisWeekLbs).toBe(0);
      expect(metrics.percentChangeFromLastWeek).toBe(0);
      expect(metrics.totalSpendThisMonth).toBe(0);
      expect(metrics.totalSpendLastMonth).toBe(0);
      expect(metrics.activeSubscriptions).toHaveLength(0);
      expect(metrics.localGrowersSupplying).toBe(0);
      expect(metrics.furthestGrowerDistanceMiles).toBe(0);
      expect(metrics.avgGrowerDistanceMiles).toBe(0);
    });

    it('should calculate 100% increase if last week was 0 and this week has orders', async () => {
      vi.mocked(buyerRepository.getDashboardMetrics).mockResolvedValueOnce({
        weightAgg: { ozThisWeek: 160, ozLastWeek: 0 },
        spendAgg: { spendThisMonth: 0, spendLastMonth: 0 },
        growers: [],
      });

      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([]);

      const metrics = await getBuyerDashboardMetrics('buyer_spike');

      expect(metrics.onOrderThisWeekLbs).toBe(10);
      expect(metrics.percentChangeFromLastWeek).toBe(100);
    });
  });
});
