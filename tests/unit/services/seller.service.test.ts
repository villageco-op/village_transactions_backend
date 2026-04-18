import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSellerDashboard,
  getSellerEarningsMetrics,
} from '../../../src/services/seller.service.js';
import { sellerRepository } from '../../../src/repositories/seller.repository.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';

vi.mock('../../../src/repositories/seller.repository.js', () => ({
  sellerRepository: {
    getEarningsMetrics: vi.fn(),
    getDashboardMetrics: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    getActiveListingsBySeller: vi.fn(),
  },
}));

describe('SellerService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
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

  describe('getSellerDashboard', () => {
    it('should format dashboard metrics and compute onTrackWithGoal correctly (On Track)', async () => {
      vi.mocked(sellerRepository.getDashboardMetrics).mockResolvedValueOnce({
        seller: {
          goal: '1000.00',
          address: '123 Farm St',
          lat: 35.1,
          lng: -120.5,
          city: 'Town',
          country: 'USA',
          zip: '00021',
          state: 'Idaho',
        },
        aggregates: { earnedThisMonth: '600.00', earnedLastMonth: '800.00' },
        weeklySales: { soldThisWeekOz: '320' },
        produceSalesThisMonth: [{ produceName: 'Corn', earned: '600.00' }],
      });

      vi.mocked(produceRepository.getActiveListingsBySeller).mockResolvedValueOnce([
        { title: 'Corn' },
        { title: 'Tomatoes' },
      ]);

      const result = await getSellerDashboard('seller_123');

      expect(result.earnedThisMonth).toBe(600);
      expect(result.monthlyGoal).toBe(1000);
      expect(result.onTrackWithGoal).toBe(true);
      expect(result.soldThisWeekLbs).toBe(20);
      expect(result.activeListingsCount).toBe(2);
      expect(result.activeListingsNames).toEqual(['Corn', 'Tomatoes']);
      expect(result.sellerLocation).toEqual({
        lat: 35.1,
        lng: -120.5,
        address: '123 Farm St',
        city: 'Town',
        country: 'USA',
        zip: '00021',
        state: 'Idaho',
      });
      expect(result.earningsByProduceThisMonth).toEqual([{ produceName: 'Corn', earned: 600 }]);
    });

    it('should compute onTrackWithGoal correctly when falling behind (Off Track)', async () => {
      vi.mocked(sellerRepository.getDashboardMetrics).mockResolvedValueOnce({
        seller: {
          goal: '1000.00',
          address: null,
          lat: null,
          lng: null,
          city: null,
          state: null,
          country: null,
          zip: null,
        },
        aggregates: { earnedThisMonth: '400.00', earnedLastMonth: '300.00' },
        weeklySales: { soldThisWeekOz: '160' },
        produceSalesThisMonth: [],
      });

      vi.mocked(produceRepository.getActiveListingsBySeller).mockResolvedValueOnce([]);

      const result = await getSellerDashboard('seller_123');

      expect(result.earnedThisMonth).toBe(400);
      expect(result.onTrackWithGoal).toBe(false);
      expect(result.activeListingsCount).toBe(0);
      expect(result.sellerLocation).toEqual({
        lat: null,
        lng: null,
        address: null,
        city: null,
        state: null,
        country: null,
        zip: null,
      });
    });
  });
});
