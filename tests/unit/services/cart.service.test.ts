import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addToCart } from '../../../src/services/cart.service.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    addToCart: vi.fn(),
  },
}));

describe('CartService - addToCart', () => {
  const mockBuyerId = 'buyer_123';
  const mockPayload = {
    productId: '123e4567-e89b-12d3-a456-426614174000',
    quantityOz: 10.5,
    isSubscription: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
