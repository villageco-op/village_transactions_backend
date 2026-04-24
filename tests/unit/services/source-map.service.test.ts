import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSourceMapNodes,
  getSourceMapAnalytics,
} from '../../../src/services/source-map.service.js';
import { sourceMapRepository } from '../../../src/repositories/source-map.repository.js';

vi.mock('../../../src/repositories/source-map.repository.js', () => ({
  sourceMapRepository: {
    getNodes: vi.fn(),
    getAnalytics: vi.fn(),
  },
}));

describe('SourceMap Service - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSourceMapNodes', () => {
    it('should cast numeric string fields to numbers and determine primaryProduceType', async () => {
      vi.mocked(sourceMapRepository.getNodes).mockResolvedValueOnce([
        {
          sellerId: 'user_1',
          name: 'Stringy Fields',
          lat: '41.123',
          lng: '-87.456',
          totalVolumeOz: '500.50',
          totalSpend: '250.00',
          produceCategories: ['Tomatoes', 'Peppers'],
        },
      ] as any);

      const nodes = await getSourceMapNodes({ buyerId: 'buyer_1' });

      expect(sourceMapRepository.getNodes).toHaveBeenCalledWith({
        buyerId: 'buyer_1',
        produceType: undefined,
      });
      expect(nodes).toHaveLength(1);
      expect(nodes[0].lat).toBe(41.123);
      expect(nodes[0].lng).toBe(-87.456);
      expect(nodes[0].totalVolumeOz).toBe(500.5);
      expect(nodes[0].totalSpend).toBe(250);
      expect(nodes[0].primaryProduceType).toBe('Tomatoes'); // Picked first element
      expect(nodes[0].produceCategories).toEqual(['Tomatoes', 'Peppers']);
    });

    it('should gracefully handle null locations and empty produce categories', async () => {
      vi.mocked(sourceMapRepository.getNodes).mockResolvedValueOnce([
        {
          sellerId: 'user_2',
          name: 'Ghost Farm',
          lat: null,
          lng: null,
          totalVolumeOz: '0',
          totalSpend: '0',
          produceCategories: [],
        },
      ] as any);

      const nodes = await getSourceMapNodes({ buyerId: 'buyer_1' });

      expect(nodes[0].lat).toBeNull();
      expect(nodes[0].lng).toBeNull();
      expect(nodes[0].primaryProduceType).toBeNull();
    });

    it('should pass the season parameter down to the repository', async () => {
      vi.mocked(sourceMapRepository.getNodes).mockResolvedValueOnce([]);

      await getSourceMapNodes({ buyerId: 'buyer_1', season: 'winter' });

      expect(sourceMapRepository.getNodes).toHaveBeenCalledWith({
        buyerId: 'buyer_1',
        season: 'winter',
      });
    });
  });

  describe('getSourceMapAnalytics', () => {
    it('should calculate percentages correctly and food miles saved', async () => {
      vi.mocked(sourceMapRepository.getAnalytics).mockResolvedValueOnce({
        totals: {
          totalVolumeOz: '200',
          totalSpend: '100',
          uniqueGrowers: '3',
          totalOrders: '5',
        },
        breakdown: [
          { produceType: 'Apples', volumeOz: '150' },
          { produceType: 'Pears', volumeOz: '50' },
        ],
      } as any);

      const analytics = await getSourceMapAnalytics({ buyerId: 'buyer_1' });

      // Food Miles: 5 orders * (1500 - 20) = 5 * 1480 = 7400
      expect(analytics.foodMilesSaved).toBe(7400);
      expect(analytics.totalSpend).toBe(100);
      expect(analytics.totalVolumeOz).toBe(200);
      expect(analytics.uniqueGrowers).toBe(3);

      expect(analytics.produceBreakdown).toHaveLength(2);
      expect(analytics.produceBreakdown[0].percentage).toBe(75); // 150 / 200 * 100
      expect(analytics.produceBreakdown[1].percentage).toBe(25); // 50 / 200 * 100
    });

    it('should handle zero totals correctly without dividing by zero', async () => {
      vi.mocked(sourceMapRepository.getAnalytics).mockResolvedValueOnce({
        totals: {
          totalVolumeOz: '0',
          totalSpend: '0',
          uniqueGrowers: '0',
          totalOrders: '0',
        },
        breakdown: [{ produceType: 'Apples', volumeOz: '0' }],
      } as any);

      const analytics = await getSourceMapAnalytics({ buyerId: 'buyer_1' });

      expect(analytics.foodMilesSaved).toBe(0);
      expect(analytics.produceBreakdown[0].percentage).toBe(0);
    });

    it('should pass the season parameter down to the repository', async () => {
      vi.mocked(sourceMapRepository.getAnalytics).mockResolvedValueOnce({
        totals: {
          totalVolumeOz: '0',
          totalSpend: '0',
          uniqueGrowers: '0',
          totalOrders: '0',
        },
        breakdown: [],
      } as any);

      await getSourceMapAnalytics({ buyerId: 'buyer_1', season: 'spring' });

      expect(sourceMapRepository.getAnalytics).toHaveBeenCalledWith({
        buyerId: 'buyer_1',
        season: 'spring',
      });
    });
  });
});
