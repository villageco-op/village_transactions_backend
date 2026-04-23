import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapGrowers } from '../../../src/services/grower.service.js';
import { growerRepository } from '../../../src/repositories/grower.repository.js';

vi.mock('../../../src/repositories/grower.repository.js', () => ({
  growerRepository: {
    getGrowersForMap: vi.fn(),
  },
}));

describe('MapService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMapGrowers', () => {
    it('should format numeric fields correctly and enforce defaults', async () => {
      vi.mocked(growerRepository.getGrowersForMap).mockResolvedValueOnce([
        {
          sellerId: 'user_123',
          name: 'Stringy Farm',
          lat: 41.8781,
          lng: -87.6298,
          city: 'Chicago',
          specialties: ['Apples'],
          image: 'https://example.com/img.jpg',
          rating: '4.6666666666666667',
          distanceMiles: '5.26789',
        },
        {
          sellerId: 'user_456',
          name: 'Null Farm',
          lat: 42.123,
          lng: -88.123,
          city: null,
          specialties: null,
          image: null,
          rating: 0,
          distanceMiles: null,
        },
      ] as any);

      const result = await getMapGrowers({ maxDistance: 10 });

      expect(growerRepository.getGrowersForMap).toHaveBeenCalledWith({ maxDistance: 10 });

      expect(result).toHaveLength(2);

      // Verify formatting logic on Grower 1
      expect(result[0].rating).toBe(4.7);
      expect(result[0].distanceMiles).toBe(5.3); // Tests toFixed(1) rounding
      expect(result[0].city).toBe('Chicago');
      expect(result[0].specialties).toEqual(['Apples']);
      expect(result[0].image).toBe('https://example.com/img.jpg');

      // Verify fallback logic on Grower 2
      expect(result[1].rating).toBe(0);
      expect(result[1].distanceMiles).toBeNull();
      expect(result[1].city).toBeNull();
      expect(result[1].specialties).toEqual([]); // Fallback to empty array
      expect(result[1].image).toBeNull();
    });
  });
});
