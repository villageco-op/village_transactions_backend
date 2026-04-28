import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addToCart,
  getCart,
  releaseExpiredCarts,
  removeFromCart,
  updateCartItem,
  updateCartGroup,
} from '../../../src/services/cart.service.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';
import { ScheduleType } from '../../../src/db/types.js';

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    addToCart: vi.fn(),
    getActiveCart: vi.fn(),
    removeFromCart: vi.fn(),
    releaseExpiredCarts: vi.fn(),
    updateCartItem: vi.fn(),
    updateGroupFulfillment: vi.fn(),
  },
}));

// Mock process.env for consistent fee calculations
process.env.DELIVERY_FEE_BASE = '5.00';
process.env.DELIVERY_FEE_PER_MILE = '1.50';
process.env.SUBSCRIPTION_DISCOUNT_PERCENT = '10';

describe('CartService', () => {
  const mockBuyerId = 'buyer_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addToCart', () => {
    const mockPayload = {
      productId: 'prod_123',
      quantityOz: 10.5,
      isSubscription: false,
    };

    it('should successfully add item to cart and return reservation data', async () => {
      const mockReservation = {
        id: 'res_999',
        groupId: 'group_abc',
        buyerId: mockBuyerId,
        productId: mockPayload.productId,
        quantityOz: '10.50',
        expiresAt: new Date(),
      };

      vi.mocked(cartRepository.addToCart).mockResolvedValueOnce(mockReservation as any);

      const result = await addToCart(mockBuyerId, mockPayload);

      expect(result).toEqual(mockReservation);
      expect(cartRepository.addToCart).toHaveBeenCalledWith(mockBuyerId, mockPayload);
    });
  });

  describe('getCart', () => {
    it('should group items by groupId and calculate delivery fees', async () => {
      const mockExpiresAt = new Date('2030-01-01T00:00:00Z');

      // Setup: 2 items in Group A (Alice, Pickup), 1 item in Group B (Bob, Delivery)
      const mockRepoResponse: any[] = [
        {
          group: {
            id: 'group_A',
            isSubscription: false,
            frequencyDays: 0,
            fulfillmentType: 'pickup',
          },
          reservation: { id: 'res_1', quantityOz: '5', expiresAt: mockExpiresAt },
          product: {
            id: 'prod_1',
            title: 'Carrots',
            pricePerOz: '0.50',
            totalOzInventory: '100',
            availableBy: Date.now(),
            isSubscribable: true,
            images: [],
          },
          seller: { id: 'seller_A', name: 'Farmer Alice', lat: 40.0, lng: -73.0 },
          buyer: { lat: 40.0, lng: -73.0 }, // 0 miles
        },
        {
          group: {
            id: 'group_A',
            isSubscription: false,
            frequencyDays: 0,
            fulfillmentType: 'pickup',
          },
          reservation: { id: 'res_2', quantityOz: '10', expiresAt: mockExpiresAt },
          product: {
            id: 'prod_2',
            title: 'Onions',
            pricePerOz: '0.30',
            totalOzInventory: '50',
            availableBy: Date.now(),
            images: [],
          },
          seller: { id: 'seller_A', name: 'Farmer Alice', lat: 40.0, lng: -73.0 },
          buyer: { lat: 40.0, lng: -73.0 },
        },
        {
          group: {
            id: 'group_B',
            isSubscription: true,
            frequencyDays: 7,
            fulfillmentType: 'delivery',
          },
          reservation: { id: 'res_3', quantityOz: '16', expiresAt: mockExpiresAt },
          product: {
            id: 'prod_3',
            title: 'Apples',
            pricePerOz: '0.80',
            totalOzInventory: '20',
            maxOrderQuantityOz: '10',
            availableBy: Date.now(),
            images: null,
          },
          seller: { id: 'seller_B', name: 'Farmer Bob', lat: 41.0, lng: -74.0 },
          buyer: { lat: 40.0, lng: -73.0 }, // Significant distance
        },
      ];

      vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce(mockRepoResponse);

      const cart = await getCart(mockBuyerId);

      expect(cart).toHaveLength(2);

      // Group A Assertions
      const groupA = cart.find((g) => g.groupId === 'group_A');
      expect(groupA).toBeDefined();
      expect(groupA?.items).toHaveLength(2);
      expect(groupA?.deliveryFee).toBe('5.00'); // Base fee only (0 miles)
      expect(groupA?.isSubscription).toBe(false);
      expect(groupA?.items[0].isSubscribable).toBe(true);

      // Group B Assertions
      const groupB = cart.find((g) => g.groupId === 'group_B');
      expect(groupB?.isSubscription).toBe(true);
      expect(groupB?.items[0].subscriptionCostReductionPercent).toBe(10);
      // Check inventory capping: maxOrderQuantityOz should be min(totalInventory, sellerMax)
      expect(groupB?.items[0].maxOrderQuantityOz).toBe('10.00');
      expect(parseFloat(groupB!.deliveryFee)).toBeGreaterThan(5.0);
      expect(groupB?.items[0].isSubscribable).toBe(false);
    });

    it('should return an empty array if cart is empty', async () => {
      vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([]);
      const cart = await getCart(mockBuyerId);
      expect(cart).toEqual([]);
    });

    it('should set availableBy to the latest product date in the group', async () => {
      const now = new Date('2026-04-28T12:00:00Z');
      vi.setSystemTime(now);

      const pastDate = new Date('2026-04-20T10:00:00Z');
      const futureDate1 = new Date('2026-05-01T10:00:00Z');
      const futureDate2 = new Date('2026-05-05T10:00:00Z');

      const mockRepoResponse: any[] = [
        {
          group: {
            id: 'group_A',
            isSubscription: false,
            frequencyDays: 0,
            fulfillmentType: 'pickup',
          },
          reservation: { id: 'res_1', quantityOz: '5', expiresAt: now },
          product: {
            id: 'prod_1',
            availableBy: pastDate.toISOString(),
            totalOzInventory: '100',
            pricePerOz: '1.0',
          },
          seller: { id: 's1', name: 'Alice', lat: 40, lng: -73 },
          buyer: { lat: 40, lng: -73 },
        },
        {
          group: {
            id: 'group_A',
            isSubscription: false,
            frequencyDays: 0,
            fulfillmentType: 'pickup',
          },
          reservation: { id: 'res_2', quantityOz: '5', expiresAt: now },
          product: {
            id: 'prod_2',
            availableBy: futureDate2.toISOString(),
            totalOzInventory: '100',
            pricePerOz: '1.0',
          },
          seller: { id: 's1', name: 'Alice', lat: 40, lng: -73 },
          buyer: { lat: 40, lng: -73 },
        },
        {
          group: {
            id: 'group_A',
            isSubscription: false,
            frequencyDays: 0,
            fulfillmentType: 'pickup',
          },
          reservation: { id: 'res_3', quantityOz: '5', expiresAt: now },
          product: {
            id: 'prod_3',
            availableBy: futureDate1.toISOString(),
            totalOzInventory: '100',
            pricePerOz: '1.0',
          },
          seller: { id: 's1', name: 'Alice', lat: 40, lng: -73 },
          buyer: { lat: 40, lng: -73 },
        },
      ];

      vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce(mockRepoResponse);

      const cart = await getCart(mockBuyerId);
      const groupA = cart.find((g) => g.groupId === 'group_A');

      expect(groupA?.availableBy).toBe(futureDate2.toISOString());
    });
  });

  describe('removeFromCart', () => {
    it('should call repository with correct params', async () => {
      const resId = 'res_123';
      vi.mocked(cartRepository.removeFromCart).mockResolvedValueOnce(true);

      const result = await removeFromCart(mockBuyerId, resId);

      expect(result).toBe(true);
      expect(cartRepository.removeFromCart).toHaveBeenCalledWith(mockBuyerId, resId);
    });
  });

  describe('updateCartItem', () => {
    it('should update item quantity and status', async () => {
      const resId = 'res_123';
      const payload = { quantityOz: 20, isSubscription: true };
      vi.mocked(cartRepository.updateCartItem).mockResolvedValueOnce(true);

      const result = await updateCartItem(mockBuyerId, resId, payload);

      expect(result).toBe(true);
      expect(cartRepository.updateCartItem).toHaveBeenCalledWith(mockBuyerId, resId, payload);
    });
  });

  describe('updateCartGroup', () => {
    it('should update fulfillment type for a whole group', async () => {
      const groupId = 'group_123';
      const payload = { fulfillmentType: 'delivery' as ScheduleType };
      vi.mocked(cartRepository.updateGroupFulfillment).mockResolvedValueOnce(undefined as any);

      await updateCartGroup(mockBuyerId, groupId, payload);

      expect(cartRepository.updateGroupFulfillment).toHaveBeenCalledWith(
        mockBuyerId,
        groupId,
        'delivery',
      );
    });
  });

  describe('releaseExpiredCarts', () => {
    it('should return the count of released reservations', async () => {
      vi.mocked(cartRepository.releaseExpiredCarts).mockResolvedValueOnce(5);
      const result = await releaseExpiredCarts();
      expect(result).toBe(5);
    });
  });
});
