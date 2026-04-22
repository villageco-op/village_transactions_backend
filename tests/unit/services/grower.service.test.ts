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
    it('should format numeric fields correctly, coercing stringy floats from Postgres', async () => {
      vi.mocked(growerRepository.getGrowersForMap).mockResolvedValueOnce([
        {
          sellerId: 'user_123',
          name: 'Stringy Farm',
          lat: 41.8781,
          lng: -87.6298,
          image: 'https://example.com/img.jpg',
          rating: '4.6666666666666667',
        },
        {
          sellerId: 'user_456',
          name: 'Null Farm',
          lat: 42.123,
          lng: -88.123,
          image: null,
          rating: 0,
        },
      ]);

      const result = await getMapGrowers({ maxDistance: 10 });

      expect(growerRepository.getGrowersForMap).toHaveBeenCalledWith({ maxDistance: 10 });

      expect(result).toHaveLength(2);

      expect(result[0].rating).toBe(4.7);
      expect(result[0].image).toBe('https://example.com/img.jpg');

      expect(result[1].rating).toBe(0);
      expect(result[1].image).toBeNull();
    });
  });
});
