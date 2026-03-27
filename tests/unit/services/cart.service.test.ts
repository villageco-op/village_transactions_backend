import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addToCart, getCart } from '../../../src/services/cart.service.js';
import { cartRepository } from '../../../src/repositories/cart.repository.js';

vi.mock('../../../src/repositories/cart.repository.js', () => ({
  cartRepository: {
    addToCart: vi.fn(),
    getActiveCart: vi.fn(),
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

describe('CartService - getCart', () => {
  const mockBuyerId = 'buyer_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should group items by seller correctly', async () => {
    const mockExpiresAt = new Date('2030-01-01T00:00:00Z');

    const mockRepoResponse: any[] = [
      {
        reservation: {
          id: 'res_1',
          quantityOz: '5',
          isSubscription: false,
          expiresAt: mockExpiresAt,
        },
        product: { id: 'prod_1', title: 'Carrots', pricePerOz: '0.50', images: [] },
        seller: { id: 'seller_A', name: 'Farmer Alice' },
      },
      {
        reservation: {
          id: 'res_2',
          quantityOz: '10',
          isSubscription: false,
          expiresAt: mockExpiresAt,
        },
        product: { id: 'prod_2', title: 'Onions', pricePerOz: '0.30', images: [] },
        seller: { id: 'seller_A', name: 'Farmer Alice' },
      },
      {
        reservation: {
          id: 'res_3',
          quantityOz: '16',
          isSubscription: true,
          expiresAt: mockExpiresAt,
        },
        product: { id: 'prod_3', title: 'Apples', pricePerOz: '0.80', images: null },
        seller: { id: 'seller_B', name: 'Farmer Bob' },
      },
    ];

    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce(mockRepoResponse);

    const cart = await getCart(mockBuyerId);

    expect(cartRepository.getActiveCart).toHaveBeenCalledWith(mockBuyerId);
    expect(cart).toHaveLength(2);

    const sellerAGroup = cart.find((g) => g.seller.id === 'seller_A');
    expect(sellerAGroup).toBeDefined();
    expect(sellerAGroup?.items).toHaveLength(2);
    expect(sellerAGroup?.items[0].title).toBe('Carrots');
    expect(sellerAGroup?.items[1].title).toBe('Onions');

    const sellerBGroup = cart.find((g) => g.seller.id === 'seller_B');
    expect(sellerBGroup).toBeDefined();
    expect(sellerBGroup?.items).toHaveLength(1);
    expect(sellerBGroup?.items[0].isSubscription).toBe(true);
    expect(sellerBGroup?.items[0].expiresAt).toBe(mockExpiresAt.toISOString());
  });

  it('should return an empty array if cart is empty', async () => {
    vi.mocked(cartRepository.getActiveCart).mockResolvedValueOnce([]);
    const cart = await getCart(mockBuyerId);
    expect(cart).toEqual([]);
  });
});
