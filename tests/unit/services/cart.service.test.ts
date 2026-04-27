import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addToCart,
  getCart,
  releaseExpiredCarts,
  removeFromCart,
  updateCartItem,
} from '../../../src/services/cart.service.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    addToCart: vi.fn(),
    getActiveCart: vi.fn(),
    removeFromCart: vi.fn(),
    releaseExpiredCarts: vi.fn(),
    updateCartItem: vi.fn(),
  },
}));

describe('CartService', () => {
  const mockBuyerId = 'buyer_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addToCart', () => {
    const mockPayload = {
      productId: '123e4567-e89b-12d3-a456-426614174000',
      quantityOz: 10.5,
      isSubscription: false,
    };

    it('should successfully add item to cart and return reservation data', async () => {
      const mockReservation = {
        id: 'res_999',
        buyerId: mockBuyerId,
        productId: mockPayload.productId,
        quantityOz: '10.50',
        isSubscription: false,
        expiresAt: new Date(),
        createdAt: new Date(),
      };

      vi.mocked(cartRepository.addToCart).mockResolvedValueOnce(mockReservation as any);

      const result = await addToCart(mockBuyerId, mockPayload);
      expect(result).toEqual(mockReservation);
      expect(cartRepository.addToCart).toHaveBeenCalledWith(mockBuyerId, mockPayload);
    });

    it('should propagate errors from the repository', async () => {
      vi.mocked(cartRepository.addToCart).mockRejectedValueOnce(new Error('DB Error'));
      await expect(addToCart(mockBuyerId, mockPayload)).rejects.toThrow('DB Error');
    });
  });

  describe('getCart', () => {
    const mockExpiresAt = new Date('2030-01-01T00:00:00Z');

    beforeEach(() => {
      vi.stubEnv('DELIVERY_FEE_BASE', '5.00');
      vi.stubEnv('DELIVERY_FEE_PER_MILE', '2.00');
      vi.stubEnv('SUBSCRIPTION_DISCOUNT_PERCENT', '15');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should group items by seller AND subscription status, calculate fees, and set limits', async () => {
      const mockRepoResponse: any[] = [
        {
          reservation: {
            id: 'res_1',
            quantityOz: '5',
            isSubscription: false,
            expiresAt: mockExpiresAt,
          },
          product: {
            id: 'p_1',
            title: 'Carrots',
            pricePerOz: '0.50',
            totalOzInventory: '100',
            maxOrderQuantityOz: null,
            harvestFrequencyDays: 7,
            images: [],
          },
          seller: { id: 'seller_A', name: 'Farmer Alice', lat: 40.0, lng: -73.0 },
          buyer: { lat: 40.0, lng: -73.0 }, // Distance 0
        },
        {
          reservation: {
            id: 'res_2',
            quantityOz: '10',
            isSubscription: true,
            expiresAt: mockExpiresAt,
          },
          product: {
            id: 'p_2',
            title: 'Onions',
            pricePerOz: '0.30',
            totalOzInventory: '50',
            maxOrderQuantityOz: '20',
            harvestFrequencyDays: 14,
            images: [],
          },
          seller: { id: 'seller_A', name: 'Farmer Alice', lat: 40.0, lng: -73.0 },
          buyer: { lat: 40.0, lng: -73.0 }, // Distance 0
        },
        {
          reservation: {
            id: 'res_3',
            quantityOz: '16',
            isSubscription: false,
            expiresAt: mockExpiresAt,
          },
          product: {
            id: 'p_3',
            title: 'Apples',
            pricePerOz: '0.80',
            totalOzInventory: '10',
            maxOrderQuantityOz: '40',
            harvestFrequencyDays: 1,
            images: null,
          },
          // ~69 miles distance for 1 degree difference in lat
          seller: { id: 'seller_B', name: 'Farmer Bob', lat: 41.0, lng: -73.0 },
          buyer: { lat: 40.0, lng: -73.0 },
        },
      ];

      vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce(mockRepoResponse);

      const cartGroups = await getCart(mockBuyerId);

      expect(cartRepository.getActiveCart).toHaveBeenCalledWith(mockBuyerId);

      // Should separate Seller A into Onetime and Subscription groups
      expect(cartGroups).toHaveLength(3);

      const sellerAOneTime = cartGroups.find((g) => g.groupId === 'seller_A-onetime');
      expect(sellerAOneTime).toBeDefined();
      expect(sellerAOneTime!.isSubscription).toBe(false);
      expect(sellerAOneTime!.deliveryFee).toBe('5.00'); // 0 miles = base fee
      expect(sellerAOneTime!.items[0].maxOrderQuantityOz).toBe('100.00'); // Min(100, Infinity)
      expect(sellerAOneTime!.items[0].subscriptionCostReductionPercent).toBeNull();

      const sellerASub = cartGroups.find((g) => g.groupId === 'seller_A-sub');
      expect(sellerASub).toBeDefined();
      expect(sellerASub!.isSubscription).toBe(true);
      expect(sellerASub!.items[0].maxOrderQuantityOz).toBe('20.00'); // Min(50, 20)
      expect(sellerASub!.items[0].subscriptionFrequencyDays).toBe(14);
      expect(sellerASub!.items[0].subscriptionCostReductionPercent).toBe(15);

      const sellerBOneTime = cartGroups.find((g) => g.groupId === 'seller_B-onetime');
      expect(sellerBOneTime).toBeDefined();
      // 1 degree lat ~69 miles. Base 5.00 + (69.09 * 2.00) = ~143.19
      expect(parseFloat(sellerBOneTime!.deliveryFee)).toBeGreaterThan(140);
      expect(sellerBOneTime!.items[0].maxOrderQuantityOz).toBe('10.00'); // Min(10, 40)
    });

    it('should return an empty array if cart is empty', async () => {
      vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([]);
      const cart = await getCart(mockBuyerId);
      expect(cart).toEqual([]);
    });
  });

  describe('removeFromCart', () => {
    const mockReservationId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return true when a reservation is successfully removed', async () => {
      vi.mocked(cartRepository.removeFromCart).mockResolvedValueOnce(true);
      const result = await removeFromCart(mockBuyerId, mockReservationId);
      expect(result).toBe(true);
      expect(cartRepository.removeFromCart).toHaveBeenCalledWith(mockBuyerId, mockReservationId);
    });

    it('should propagate errors from the repository', async () => {
      vi.mocked(cartRepository.removeFromCart).mockRejectedValueOnce(new Error('DB Error'));
      await expect(removeFromCart(mockBuyerId, mockReservationId)).rejects.toThrow('DB Error');
    });
  });

  describe('releaseExpiredCarts', () => {
    it('should successfully call releaseExpiredCarts on the repository and return the count', async () => {
      vi.mocked(cartRepository.releaseExpiredCarts).mockResolvedValueOnce(4);
      const result = await releaseExpiredCarts();
      expect(result).toBe(4);
      expect(cartRepository.releaseExpiredCarts).toHaveBeenCalledOnce();
    });
  });

  describe('updateCartItem', () => {
    const mockReservationId = '123e4567-e89b-12d3-a456-426614174000';
    const mockPayload = { quantityOz: 15, isSubscription: true };

    it('should return true when a reservation is successfully updated', async () => {
      vi.mocked(cartRepository.updateCartItem).mockResolvedValueOnce(true);
      const result = await updateCartItem(mockBuyerId, mockReservationId, mockPayload);
      expect(result).toBe(true);
    });
  });
});
