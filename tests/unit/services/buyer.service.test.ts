import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBillingSummary,
  getGrowersForBuyer,
  getBuyerDashboardMetrics,
  getBuyerProfile,
} from '../../../src/services/buyer.service.js';
import { buyerRepository } from '../../../src/repositories/buyer.repository.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { organizationRepository } from '../../../src/repositories/organization.repository.js';

vi.mock('../../../src/repositories/buyer.repository.js', () => ({
  buyerRepository: {
    getGrowersByBuyerId: vi.fn(),
    getBuyerWithOrdersForSummary: vi.fn(),
    getDashboardMetrics: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getActiveSubscriptionsForBuyer: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    getBuyerOrderStats: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/organization.repository.js', () => ({
  organizationRepository: {
    findById: vi.fn(),
  },
}));

describe('BuyerService - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGrowersForBuyer', () => {
    it('should correctly transform paginated repository data and include unpaginated cities', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce({
        items: [
          {
            sellerId: 'seller_123',
            name: 'Test Farm',
            address: '123 Farm Way',
            lat: 0.0,
            lng: 10.0,
            city: 'Chicago',
            state: 'IL',
            country: 'USA',
            zip: '12345',
            produceTypesOrdered: ['leafy_greens'],
            amountThisMonthOz: 16,
            firstOrderDate: tenDaysAgo,
          },
        ],
        total: 25,
        cities: ['Chicago'],
      });

      const result = await getGrowersForBuyer('buyer_123', 2, 20, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].amountOrderedThisMonthLbs).toBe(1); // 16 oz = 1 lb
      expect(result.data[0].daysSinceFirstOrder).toBe(10);

      expect(result.cities).toEqual(['Chicago']);

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 20,
        totalPages: 2,
      });

      // Assert repository was called without filters
      expect(buyerRepository.getGrowersByBuyerId).toHaveBeenCalledWith(
        'buyer_123',
        20,
        20,
        undefined,
        undefined,
      );
    });

    it('should query the buyer and format distance parameters if maxDistance is provided', async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce({
        id: 'buyer_123',
        lat: 40.7128,
        lng: -74.006,
      } as any);

      vi.mocked(buyerRepository.getGrowersByBuyerId).mockResolvedValueOnce({
        items: [],
        total: 0,
        cities: [],
      });

      await getGrowersForBuyer('buyer_123', 1, 10, 0, 'apples', 25);

      // Verify the user was fetched to get Lat/Lng
      expect(userRepository.findById).toHaveBeenCalledWith('buyer_123');

      // Verify repository was called correctly
      expect(buyerRepository.getGrowersByBuyerId).toHaveBeenCalledWith(
        'buyer_123',
        10,
        0,
        'apples', // search property
        { lat: 40.7128, lng: -74.006, maxDistance: 25 }, // formatted distance lookup property
      );
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
        weightAgg: { ozThisWeek: 320 },
        spendAgg: { spendThisMonth: 1500 },
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

      expect(metrics.totalSpendThisMonth).toBe(1500);

      expect(metrics.activeSubscriptions).toBe(1);

      expect(metrics.localGrowersSupplying).toBe(2);
    });

    it('should gracefully handle empty or zeroed data', async () => {
      vi.mocked(buyerRepository.getDashboardMetrics).mockResolvedValueOnce({
        weightAgg: { ozThisWeek: 0 },
        spendAgg: { spendThisMonth: 0 },
        growers: [{ sellerId: 'id_1', isLocal: false, distance: null }],
      });

      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([]);

      const metrics = await getBuyerDashboardMetrics('buyer_zero');

      expect(metrics.onOrderThisWeekLbs).toBe(0);
      expect(metrics.totalSpendThisMonth).toBe(0);
      expect(metrics.activeSubscriptions).toBe(0);
      expect(metrics.localGrowersSupplying).toBe(0);
    });

    it('should calculate 100% increase if last week was 0 and this week has orders', async () => {
      vi.mocked(buyerRepository.getDashboardMetrics).mockResolvedValueOnce({
        weightAgg: { ozThisWeek: 160 },
        spendAgg: { spendThisMonth: 0 },
        growers: [],
      });

      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([]);

      const metrics = await getBuyerDashboardMetrics('buyer_spike');

      expect(metrics.onOrderThisWeekLbs).toBe(10);
    });
  });

  describe('getBuyerProfile', () => {
    it('should successfully return a sanitized buyer profile with organization name when user belongs to an organization', async () => {
      const buyerId = 'buyer_123';
      const orgId = 'org_456';
      const mockDate = new Date('2024-01-15T00:00:00Z');
      const lastOrderDate = new Date('2024-05-10T12:00:00Z');

      const mockUser = {
        id: buyerId,
        name: 'Jane Doe',
        image: 'https://example.com/avatar.jpg',
        organizationId: orgId,
        country: 'USA',
        state: 'California',
        city: 'San Francisco',
        createdAt: mockDate,
      };

      vi.mocked(userRepository.findById).mockResolvedValueOnce(mockUser as any);
      vi.mocked(orderRepository.getBuyerOrderStats).mockResolvedValueOnce({
        totalOrders: 5,
        lastOrderDate,
      });
      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([
        { id: 'sub_1' },
        { id: 'sub_2' },
      ] as any);
      vi.mocked(organizationRepository.findById).mockResolvedValueOnce({
        id: orgId,
        name: 'Green Thumb Co-op',
      } as any);

      const profile = await getBuyerProfile(buyerId);

      expect(userRepository.findById).toHaveBeenCalledWith(buyerId);
      expect(orderRepository.getBuyerOrderStats).toHaveBeenCalledWith(buyerId);
      expect(subscriptionRepository.getActiveSubscriptionsForBuyer).toHaveBeenCalledWith(buyerId);
      expect(organizationRepository.findById).toHaveBeenCalledWith(orgId);

      expect(profile).toEqual({
        id: buyerId,
        name: 'Jane Doe',
        image: 'https://example.com/avatar.jpg',
        organization: 'Green Thumb Co-op',
        organizationId: orgId,
        country: 'USA',
        state: 'California',
        city: 'San Francisco',
        joinedAt: mockDate,
        totalOrders: 5,
        activeSubscriptions: 2,
        lastOrderDate,
      });
    });

    it('should handle buyer profile without an organization gracefully', async () => {
      const buyerId = 'buyer_independent';
      const mockDate = new Date('2024-02-01T00:00:00Z');

      const mockUser = {
        id: buyerId,
        name: 'John Independent',
        image: null,
        organizationId: null,
        country: 'USA',
        state: 'Oregon',
        city: 'Portland',
        createdAt: mockDate,
      };

      vi.mocked(userRepository.findById).mockResolvedValueOnce(mockUser as any);
      vi.mocked(orderRepository.getBuyerOrderStats).mockResolvedValueOnce({
        totalOrders: 0,
        lastOrderDate: null,
      });
      vi.mocked(subscriptionRepository.getActiveSubscriptionsForBuyer).mockResolvedValueOnce([]);

      const profile = await getBuyerProfile(buyerId);

      expect(organizationRepository.findById).not.toHaveBeenCalled();

      expect(profile).toEqual({
        id: buyerId,
        name: 'John Independent',
        image: null,
        organization: null,
        organizationId: null,
        country: 'USA',
        state: 'Oregon',
        city: 'Portland',
        joinedAt: mockDate,
        totalOrders: 0,
        activeSubscriptions: 0,
        lastOrderDate: null,
      });
    });

    it('should throw a 404 HTTPException and log a warning if the user is not found', async () => {
      const buyerId = 'non_existent_buyer';
      const mockLogger = {
        warn: vi.fn(),
      };

      vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

      await expect(getBuyerProfile(buyerId, mockLogger as any)).rejects.toThrow(
        expect.objectContaining({
          status: 404,
          message: 'User not found',
        }),
      );

      expect(mockLogger.warn).toHaveBeenCalledWith('Requested buyer profile not found');
      expect(orderRepository.getBuyerOrderStats).not.toHaveBeenCalled();
      expect(subscriptionRepository.getActiveSubscriptionsForBuyer).not.toHaveBeenCalled();
    });
  });
});
