import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import * as orderService from '../../../src/services/order.service.js';
import {
  createProduceListing,
  deleteProduceListing,
  getProduceList,
  getProduceListing,
  getProduceMap,
  getProduceOrders,
  getSellerProduceListings,
  updateProduceListing,
} from '../../../src/services/produce.service.js';
import * as subscriptionService from '../../../src/services/subscription.service.js';
import { produceRepository } from '../../../src/repositories/produce.repository.js';
import { subscriptionRepository } from '../../../src/repositories/subscription.repository.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { ProduceType } from '../../../src/db/types.js';

vi.mock('../../../src/repositories/produce.repository.js', () => ({
  produceRepository: {
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    getList: vi.fn(),
    getMapItems: vi.fn(),
    getProduceOrders: vi.fn(),
    getSellerListings: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    getAnalyticsForProducts: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/subscription.repository.js', () => ({
  subscriptionRepository: {
    getActiveSubscriptionsForProducts: vi.fn(),
  },
}));

describe('ProduceService - createProduceListing', () => {
  const mockPayload = {
    title: 'Organic Carrots',
    produceType: 'root_vegetables' as ProduceType,
    pricePerOz: 0.5,
    totalOzInventory: 100,
    harvestFrequencyDays: 7,
    seasonStart: '2024-05-01',
    seasonEnd: '2024-10-31',
    images: ['https://example.com/carrot.jpg'],
    isSubscribable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully create a produce listing and return the created data', async () => {
    const mockDbProduce = {
      id: 'prod_123',
      sellerId: 'user_123',
      title: 'Organic Carrots',
      produceType: 'root_vegetables',
      pricePerOz: '0.50',
      totalOzInventory: '100',
      harvestFrequencyDays: 7,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/carrot.jpg'],
      isSubscribable: true,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(produceRepository.create).mockResolvedValueOnce(mockDbProduce as any);

    const result = await createProduceListing('user_123', mockPayload);

    expect(result).toEqual(mockDbProduce);
    expect(produceRepository.create).toHaveBeenCalledWith('user_123', mockPayload);
  });

  it('should propagate repository errors upward', async () => {
    const dbError = new Error('Database Timeout');
    vi.mocked(produceRepository.create).mockRejectedValueOnce(dbError);

    await expect(createProduceListing('user_123', mockPayload)).rejects.toThrow('Database Timeout');

    expect(produceRepository.create).toHaveBeenCalledTimes(1);
  });
});

describe('ProduceService - updateProduceListing', () => {
  const mockId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSellerId = 'user_123';
  const mockUpdatePayload = {
    status: 'paused' as const,
    totalOzInventory: 50,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(subscriptionService, 'batchCancelProductSubscriptions').mockResolvedValue(undefined);
    vi.spyOn(orderService, 'batchCancelPendingOrders').mockResolvedValue(undefined);
  });

  it('should successfully update a produce listing and return the updated data', async () => {
    const mockOldProduce = {
      id: mockId,
      sellerId: mockSellerId,
      status: 'active',
      isSubscribable: true,
      harvestFrequencyDays: 7,
    };

    const mockUpdatedDbProduce = {
      id: mockId,
      sellerId: mockSellerId,
      title: 'Organic Carrots',
      produceType: 'root_vegetables',
      pricePerOz: '0.50',
      totalOzInventory: '50',
      harvestFrequencyDays: 7,
      seasonStart: '2024-05-01',
      seasonEnd: '2024-10-31',
      images: ['https://example.com/carrot.jpg'],
      isSubscribable: true,
      status: 'paused', // updated field
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(produceRepository.getById).mockResolvedValueOnce(mockOldProduce as any);
    vi.mocked(produceRepository.update).mockResolvedValueOnce(mockUpdatedDbProduce as any);

    const result = await updateProduceListing(mockId, mockSellerId, mockUpdatePayload);

    expect(result).toEqual(mockUpdatedDbProduce);
    expect(produceRepository.getById).toHaveBeenCalledWith(mockId);
    expect(produceRepository.update).toHaveBeenCalledWith(mockId, mockSellerId, mockUpdatePayload);

    expect(subscriptionService.batchCancelProductSubscriptions).toHaveBeenCalled();
    expect(orderService.batchCancelPendingOrders).toHaveBeenCalled();
  });

  it('should return null if listing is not found or unauthorized', async () => {
    vi.mocked(produceRepository.getById).mockResolvedValueOnce(null as any);

    const result = await updateProduceListing(mockId, mockSellerId, mockUpdatePayload);

    expect(result).toBeNull();
    expect(produceRepository.getById).toHaveBeenCalledWith(mockId);
    expect(produceRepository.update).not.toHaveBeenCalled();
  });

  it('should propagate repository errors upward', async () => {
    const mockOldProduce = {
      id: mockId,
      sellerId: mockSellerId,
      status: 'active',
      isSubscribable: true,
      harvestFrequencyDays: 7,
    };

    const dbError = new Error('Database Connection Lost');

    vi.mocked(produceRepository.getById).mockResolvedValueOnce(mockOldProduce as any);
    vi.mocked(produceRepository.update).mockRejectedValueOnce(dbError);

    await expect(updateProduceListing(mockId, mockSellerId, mockUpdatePayload)).rejects.toThrow(
      'Database Connection Lost',
    );

    expect(produceRepository.getById).toHaveBeenCalledWith(mockId);
    expect(produceRepository.update).toHaveBeenCalledTimes(1);
  });
});

describe('ProduceService - deleteProduceListing', () => {
  const mockId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSellerId = 'user_123';

  const batchSubSpy = vi
    .spyOn(subscriptionService, 'batchCancelProductSubscriptions')
    .mockImplementation(() => Promise.resolve());
  const batchOrderSpy = vi
    .spyOn(orderService, 'batchCancelPendingOrders')
    .mockImplementation(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully soft delete and trigger batch cancellations', async () => {
    vi.mocked(produceRepository.softDelete).mockResolvedValueOnce(true);

    const result = await deleteProduceListing(mockId, mockSellerId);

    expect(result).toBe(true);
    expect(produceRepository.softDelete).toHaveBeenCalledWith(mockId, mockSellerId);

    expect(batchSubSpy).toHaveBeenCalled();
    expect(batchOrderSpy).toHaveBeenCalled();
  });

  it('should return false and NOT trigger cancellations if delete fails', async () => {
    vi.mocked(produceRepository.softDelete).mockResolvedValueOnce(false);

    const result = await deleteProduceListing(mockId, mockSellerId);

    expect(result).toBe(false);
    expect(produceRepository.softDelete).toHaveBeenCalledWith(mockId, mockSellerId);

    expect(batchSubSpy).not.toHaveBeenCalled();
    expect(batchOrderSpy).not.toHaveBeenCalled();
  });
});

describe('ProduceService - getProduceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format repository results, extracting the thumbnail, parsing distance, and returning pagination meta', async () => {
    const mockDbDate = new Date();
    const mockRepoResponse = {
      items: [
        {
          id: 'prod_1',
          name: 'Apples',
          price: '0.50',
          amount: '100',
          images: ['https://example.com/apple1.jpg', 'https://example.com/apple2.jpg'],
          isSubscribable: true,
          availableBy: mockDbDate,
          sellerId: 'user_1',
          sellerName: 'Farmer Bob',
          distance: '5.234',
        },
        {
          id: 'prod_2',
          name: 'Oranges',
          price: '0.75',
          amount: '50',
          images: [],
          isSubscribable: false,
          availableBy: mockDbDate,
          sellerId: 'user_2',
          sellerName: 'Farmer Jane',
          distance: '10.5',
        },
      ],
      total: 45,
    };

    vi.mocked(produceRepository.getList).mockResolvedValueOnce(mockRepoResponse as any);

    const result = await getProduceList({
      lat: 40.0,
      lng: -70.0,
      page: 2,
      limit: 20,
      offset: 20,
    });

    expect(produceRepository.getList).toHaveBeenCalledWith({
      lat: 40.0,
      lng: -70.0,
      page: 2,
      limit: 20,
      offset: 20,
    });

    expect(result.data[0]).toEqual({
      id: 'prod_1',
      name: 'Apples',
      price: '0.50',
      amount: '100',
      isSubscribable: true,
      availableBy: mockDbDate,
      sellerId: 'user_1',
      sellerName: 'Farmer Bob',
      distance: 5.234,
      thumbnail: 'https://example.com/apple1.jpg',
    });

    expect(result.data[1]).toEqual({
      id: 'prod_2',
      name: 'Oranges',
      price: '0.75',
      amount: '50',
      isSubscribable: false,
      availableBy: mockDbDate,
      sellerId: 'user_2',
      sellerName: 'Farmer Jane',
      distance: 10.5,
      thumbnail: null,
    });

    expect(result.meta).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3, // Math.ceil(45 / 20)
    });
  });
});

describe('ProduceService - getProduceMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly group items by sellerId and construct lightweight produce arrays', async () => {
    const mockRepoResponse = [
      {
        id: 'prod_1',
        name: 'Apples',
        images: ['https://example.com/apple1.jpg'],
        sellerId: 'user_1',
        lat: 40.0,
        lng: -70.0,
      },
      {
        id: 'prod_2',
        name: 'Carrots',
        images: [],
        sellerId: 'user_1',
        lat: 40.0,
        lng: -70.0,
      },
      {
        id: 'prod_3',
        name: 'Oranges',
        images: ['https://example.com/orange.jpg'],
        sellerId: 'user_2',
        lat: 41.0,
        lng: -71.0,
      },
    ];

    vi.mocked(produceRepository.getMapItems).mockResolvedValueOnce(mockRepoResponse as any);

    const result = await getProduceMap({
      lat: 40.0,
      lng: -70.0,
      radiusMiles: 50,
    });

    expect(produceRepository.getMapItems).toHaveBeenCalledWith({
      lat: 40.0,
      lng: -70.0,
      radiusMiles: 50,
    });

    expect(result).toHaveLength(2);

    const seller1 = result.find((s: { sellerId: string }) => s.sellerId === 'user_1');
    expect(seller1).toBeDefined();
    expect(seller1?.lat).toBe(40.0);
    expect(seller1?.lng).toBe(-70.0);
    expect(seller1?.produce).toHaveLength(2);
    expect(seller1?.produce[0]).toEqual({
      id: 'prod_1',
      name: 'Apples',
      thumbnail: 'https://example.com/apple1.jpg',
    });
    expect(seller1?.produce[1]).toEqual({
      id: 'prod_2',
      name: 'Carrots',
      thumbnail: null,
    });

    const seller2 = result.find((s) => s.sellerId === 'user_2');
    expect(seller2).toBeDefined();
    expect(seller2?.lat).toBe(41.0);
    expect(seller2?.lng).toBe(-71.0);
    expect(seller2?.produce).toHaveLength(1);
  });
});

describe('ProduceService - getProduceOrders', () => {
  const mockProduceId = 'prod_123';
  const mockSellerId = 'seller_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully retrieve paginated orders for a produce listing', async () => {
    const mockDbOrders = [
      {
        id: 'order_1',
        status: 'pending',
        fulfillmentType: 'pickup',
        scheduledTime: new Date(),
        totalAmount: '10.50',
        quantityOz: '50',
        createdAt: new Date(),
        buyer: {
          id: 'buyer_1',
          name: 'John Doe',
          image: 'https://example.com/john.jpg',
        },
      },
    ];

    vi.mocked(produceRepository.getProduceOrders).mockResolvedValueOnce({
      items: mockDbOrders,
      total: 1,
    } as any);

    const result = await getProduceOrders(mockProduceId, mockSellerId, 1, 10, 0);

    expect(result?.data).toEqual(mockDbOrders);
    expect(result?.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    expect(produceRepository.getProduceOrders).toHaveBeenCalledWith(
      mockProduceId,
      mockSellerId,
      10,
      0,
    );
  });

  it('should return null if the user is unauthorized or the listing does not exist', async () => {
    vi.mocked(produceRepository.getProduceOrders).mockResolvedValueOnce(null);

    const result = await getProduceOrders(mockProduceId, mockSellerId, 1, 10, 0);

    expect(result).toBeNull();
    expect(produceRepository.getProduceOrders).toHaveBeenCalledWith(
      mockProduceId,
      mockSellerId,
      10,
      0,
    );
  });

  it('should propagate repository errors upward', async () => {
    vi.mocked(produceRepository.getProduceOrders).mockRejectedValueOnce(
      new Error('Database Timeout'),
    );

    await expect(getProduceOrders(mockProduceId, mockSellerId, 1, 10, 0)).rejects.toThrow(
      'Database Timeout',
    );
  });
});

describe('ProduceService - getSellerProduceListings', () => {
  const mockSellerId = 'user_123';
  const mockDate = new Date('2024-05-15T12:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should successfully retrieve a paginated list of the sellers own produce with analytics', async () => {
    const mockDbProduce = [
      {
        id: 'prod_1',
        sellerId: mockSellerId,
        title: 'My Apples',
        status: 'active',
        totalOzInventory: '100',
        availableBy: new Date('2024-05-10T12:00:00Z'), // 5 days ago
        harvestFrequencyDays: 7, // Next harvest should be 2024-05-17
      },
      {
        id: 'prod_2',
        sellerId: mockSellerId,
        title: 'My Oranges',
        status: 'paused',
        totalOzInventory: '50',
        availableBy: new Date('2024-05-20T12:00:00Z'),
        harvestFrequencyDays: 14,
      },
    ];

    vi.mocked(produceRepository.getSellerListings).mockResolvedValueOnce({
      items: mockDbProduce,
      total: 15,
    } as any);

    const thirtyOneDaysAgo = new Date('2024-04-13T12:00:00Z');
    const fiveDaysAgo = new Date('2024-05-10T12:00:00Z');

    vi.mocked(orderRepository.getAnalyticsForProducts).mockResolvedValueOnce([
      {
        productId: 'prod_1',
        orderId: 'ord_1',
        quantityOz: '10',
        pricePerOz: '2',
        status: 'completed',
        createdAt: fiveDaysAgo,
      },
      {
        productId: 'prod_1',
        orderId: 'ord_2',
        quantityOz: '5',
        pricePerOz: '2',
        status: 'completed',
        createdAt: thirtyOneDaysAgo,
      },
      {
        productId: 'prod_1',
        orderId: 'ord_3',
        quantityOz: '20',
        pricePerOz: '2',
        status: 'pending',
        createdAt: fiveDaysAgo,
      },
    ] as any);

    vi.mocked(subscriptionRepository.getActiveSubscriptionsForProducts).mockResolvedValueOnce([
      { productId: 'prod_1', quantityOz: '15', nextDeliveryDate: new Date('2024-05-16T12:00:00Z') },
    ] as any);

    const result = await getSellerProduceListings(mockSellerId, {
      page: 2,
      limit: 10,
      offset: 10,
      status: undefined,
    });

    expect(result.data[0].analytics).toEqual({
      totalOzSold: 15,
      totalMonthlyEarnings: 20,
      numberOfSubscriptions: 1,
      numberOfOrders: 3,
      percentSold: 35,
      upcomingSubscriptionOzNeeded: 15,
      availableInventory: 80,
      inventorySufficientForUpcoming: true,
      nextHarvestDate: new Date('2024-05-17T12:00:00.000Z').toISOString(),
    });

    expect(result.data[1].analytics).toEqual({
      totalOzSold: 0,
      totalMonthlyEarnings: 0,
      numberOfSubscriptions: 0,
      numberOfOrders: 0,
      percentSold: 0,
      upcomingSubscriptionOzNeeded: 0,
      availableInventory: 50,
      inventorySufficientForUpcoming: true,
      nextHarvestDate: new Date('2024-05-20T12:00:00.000Z').toISOString(),
    });

    expect(result.meta).toEqual({
      total: 15,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
  });

  it('should propagate repository errors upward', async () => {
    vi.mocked(produceRepository.getSellerListings).mockRejectedValueOnce(
      new Error('Database Timeout'),
    );

    await expect(
      getSellerProduceListings(mockSellerId, { page: 1, limit: 10, offset: 0 }),
    ).rejects.toThrow('Database Timeout');
  });
});

describe('ProduceService - getProduceListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a produce listing with seller details when found', async () => {
    const mockDbResult = {
      id: 'prod_123',
      sellerId: 'user_123',
      title: 'Organic Carrots',
      produceType: 'root_vegetables',
      pricePerOz: '0.50',
      totalOzInventory: '100',
      seller: {
        id: 'user_123',
        name: 'Farmer Joe',
        image: 'https://example.com/joe.jpg',
      },
    };

    vi.mocked(produceRepository.getById).mockResolvedValueOnce(mockDbResult as any);

    const result = await getProduceListing('prod_123');

    expect(result).toEqual(mockDbResult);
    expect(produceRepository.getById).toHaveBeenCalledWith('prod_123');
    expect(produceRepository.getById).toHaveBeenCalledTimes(1);
  });

  it('should return undefined when the listing is not found', async () => {
    vi.mocked(produceRepository.getById).mockResolvedValueOnce(undefined);

    const result = await getProduceListing('missing_prod_999');

    expect(result).toBeUndefined();
    expect(produceRepository.getById).toHaveBeenCalledWith('missing_prod_999');
  });

  it('should propagate repository errors upward', async () => {
    const dbError = new Error('Database connection lost');
    vi.mocked(produceRepository.getById).mockRejectedValueOnce(dbError);

    await expect(getProduceListing('prod_123')).rejects.toThrow('Database connection lost');
  });
});
