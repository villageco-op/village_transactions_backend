import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  cancelOrder,
  getOrderDetails,
  getOrders,
  getSellerPayouts,
  rescheduleOrder,
} from '../../../src/services/order.service.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { refundCheckoutSession } from '../../../src/services/stripe.service.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    getOrderById: vi.fn(),
    updateOrderToCanceled: vi.fn(),
    updateOrderScheduleTime: vi.fn(),
    getOrders: vi.fn(),
    getPayoutHistory: vi.fn(),
    getOrderWithItemsById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/services/stripe.service.js', () => ({
  refundCheckoutSession: vi.fn(),
}));

vi.mock('../../../src/services/notification.service.js', () => ({
  sendPushNotification: vi.fn(),
}));

describe('OrderService - cancelOrder', () => {
  const mockOrder = {
    id: 'order_123',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    status: 'active',
    stripeSessionId: 'cs_test_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully cancel order, process refund, and send notification to seller if buyer cancels', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);
    vi.mocked(orderRepository.updateOrderToCanceled).mockResolvedValueOnce(mockOrder as any);

    await cancelOrder('order_123', 'Changed my mind', 'buyer_1');

    expect(orderRepository.getOrderById).toHaveBeenCalledWith('order_123');
    expect(orderRepository.updateOrderToCanceled).toHaveBeenCalledWith(
      'order_123',
      'Changed my mind',
    );
    expect(refundCheckoutSession).toHaveBeenCalledWith('cs_test_123');
    expect(sendPushNotification).toHaveBeenCalledWith(
      'seller_1',
      'Order Canceled ❌',
      'The buyer has canceled the order. Reason: Changed my mind',
    );
  });

  it('should successfully cancel order, process refund, and send notification to buyer if seller cancels', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);
    vi.mocked(orderRepository.updateOrderToCanceled).mockResolvedValueOnce(mockOrder as any);

    await cancelOrder('order_123', 'Out of stock', 'seller_1');

    expect(orderRepository.getOrderById).toHaveBeenCalledWith('order_123');
    expect(orderRepository.updateOrderToCanceled).toHaveBeenCalledWith('order_123', 'Out of stock');
    expect(refundCheckoutSession).toHaveBeenCalledWith('cs_test_123');
    expect(sendPushNotification).toHaveBeenCalledWith(
      'buyer_1',
      'Order Canceled ❌',
      'The seller has canceled the order. Reason: Out of stock',
    );
  });

  it('should return early if the order is already canceled', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce({
      ...mockOrder,
      status: 'canceled',
    } as any);

    await cancelOrder('order_123', 'Reason', 'buyer_1');

    expect(orderRepository.updateOrderToCanceled).not.toHaveBeenCalled();
    expect(refundCheckoutSession).not.toHaveBeenCalled();
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('should throw an HTTPException 404 if the order does not exist', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(null as any);

    await expect(cancelOrder('invalid_id', 'Reason', 'buyer_1')).rejects.toThrow(
      new HTTPException(404, { message: 'Order not found' }),
    );

    expect(orderRepository.updateOrderToCanceled).not.toHaveBeenCalled();
  });

  it('should throw an HTTPException 404 if a user not part of the order attempts to cancel', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);

    await expect(cancelOrder('order_123', 'Reason', 'random_hacker')).rejects.toThrow(
      new HTTPException(404, { message: 'Unauthorized' }),
    );

    expect(orderRepository.updateOrderToCanceled).not.toHaveBeenCalled();
  });
});

describe('OrderService - rescheduleOrder', () => {
  const mockOrder = {
    id: 'order_456',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    status: 'pending',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update scheduled time and notify seller if buyer requests', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);

    const newTime = '2025-12-01T12:00:00.000Z';
    await rescheduleOrder('order_456', newTime, 'buyer_1');

    expect(orderRepository.updateOrderScheduleTime).toHaveBeenCalledWith(
      'order_456',
      new Date(newTime),
    );
    expect(sendPushNotification).toHaveBeenCalledWith(
      'seller_1',
      'Order Rescheduled 🕒',
      expect.stringContaining('buyer has requested a new time'),
    );
  });

  it('should update scheduled time and notify buyer if seller requests', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);

    const newTime = '2025-12-01T15:00:00.000Z';
    await rescheduleOrder('order_456', newTime, 'seller_1');

    expect(orderRepository.updateOrderScheduleTime).toHaveBeenCalledWith(
      'order_456',
      new Date(newTime),
    );
    expect(sendPushNotification).toHaveBeenCalledWith(
      'buyer_1',
      'Order Rescheduled 🕒',
      expect.stringContaining('seller has requested a new time'),
    );
  });

  it('should throw HTTPException 400 if order is not pending', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce({
      ...mockOrder,
      status: 'completed',
    } as any);

    await expect(
      rescheduleOrder('order_456', '2025-12-01T12:00:00.000Z', 'buyer_1'),
    ).rejects.toThrow(
      new HTTPException(400, { message: 'Only pending orders can be rescheduled' }),
    );

    expect(orderRepository.updateOrderScheduleTime).not.toHaveBeenCalled();
  });

  it('should throw HTTPException 404 if the order does not exist', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(null as any);

    await expect(
      rescheduleOrder('invalid_id', '2025-12-01T12:00:00.000Z', 'buyer_1'),
    ).rejects.toThrow(new HTTPException(404, { message: 'Order not found' }));
  });

  it('should throw HTTPException 404 if a user not part of the order attempts to reschedule', async () => {
    vi.mocked(orderRepository.getOrderById).mockResolvedValueOnce(mockOrder as any);

    await expect(
      rescheduleOrder('order_456', '2025-12-01T12:00:00.000Z', 'random_hacker'),
    ).rejects.toThrow(new HTTPException(404, { message: 'Unauthorized' }));
  });
});

describe('OrderService - getOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call repository with parsed timeframeDays and pagination params when timeframe is provided', async () => {
    vi.mocked(orderRepository.getOrders).mockResolvedValueOnce({ items: [], total: 0 });

    const result = await getOrders('user_1', 'buyer', 'pending', '30days', 1, 10, 0);

    expect(orderRepository.getOrders).toHaveBeenCalledWith({
      userId: 'user_1',
      role: 'buyer',
      status: 'pending',
      timeframeDays: 30,
      limit: 10,
      offset: 0,
    });

    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  });

  it('should call repository without timeframeDays and return valid pagination meta', async () => {
    vi.mocked(orderRepository.getOrders).mockResolvedValueOnce({
      items: [{ id: 'order_1' } as any],
      total: 25,
    });

    const result = await getOrders('user_2', 'seller', undefined, undefined, 2, 20, 20);

    expect(orderRepository.getOrders).toHaveBeenCalledWith({
      userId: 'user_2',
      role: 'seller',
      status: undefined,
      timeframeDays: undefined,
      limit: 20,
      offset: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      total: 25,
      page: 2,
      limit: 20,
      totalPages: 2, // Math.ceil(25 / 20)
    });
  });

  it('should call repository without timeframeDays if timeframe format is invalid', async () => {
    vi.mocked(orderRepository.getOrders).mockResolvedValueOnce({ items: [], total: 0 });

    await getOrders('user_3', 'buyer', undefined, 'invalid_string', 1, 15, 0);

    expect(orderRepository.getOrders).toHaveBeenCalledWith({
      userId: 'user_3',
      role: 'buyer',
      status: undefined,
      timeframeDays: undefined,
      limit: 15,
      offset: 0,
    });
  });
});

describe('OrderService - getSellerPayouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly parse timeframe, fetch paginated data, and map payout items', async () => {
    const mockDate = new Date('2025-01-01T12:00:00Z');

    vi.mocked(orderRepository.getPayoutHistory).mockResolvedValueOnce({
      items: [
        {
          date: mockDate,
          buyerName: 'Alice Buyer',
          productName: 'Organic Carrots',
          quantityOz: '32',
          pricePerOz: '1.50',
        },
      ],
      total: 12,
    } as any);

    const result = await getSellerPayouts('seller_123', '30days', 1, 10, 0);

    expect(orderRepository.getPayoutHistory).toHaveBeenCalledWith(
      'seller_123',
      expect.any(Date),
      10,
      0,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      date: '2025-01-01T12:00:00.000Z',
      buyerName: 'Alice Buyer',
      productName: 'Organic Carrots',
      quantityLbs: 2, // 32 oz / 16
      amountDollars: 48, // 32 oz * $1.50
    });

    expect(result.meta).toEqual({
      total: 12,
      page: 1,
      limit: 10,
      totalPages: 2, // Math.ceil(12 / 10)
    });
  });

  it('should fallback to 90 days if timeframe is invalid or omitted, handle null fields gracefully, and process offsets', async () => {
    vi.mocked(orderRepository.getPayoutHistory).mockResolvedValueOnce({
      items: [
        {
          date: null,
          buyerName: null,
          productName: null,
          quantityOz: '16',
          pricePerOz: '2.00',
        },
      ],
      total: 5,
    } as any);

    const result = await getSellerPayouts('seller_123', 'invalid_frame', 2, 5, 5);

    expect(orderRepository.getPayoutHistory).toHaveBeenCalledWith(
      'seller_123',
      expect.any(Date),
      5,
      5,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].buyerName).toBe('Unknown');
    expect(result.data[0].productName).toBe('Unknown');
    expect(result.data[0].quantityLbs).toBe(1);
    expect(result.data[0].amountDollars).toBe(32);
    expect(result.data[0].date).toBeDefined();

    expect(result.meta).toEqual({
      total: 5,
      page: 2,
      limit: 5,
      totalPages: 1,
    });
  });
});

describe('OrderService - getOrderDetails', () => {
  const mockOrderWithItems = {
    id: 'order_123',
    buyerId: 'buyer_1',
    sellerId: 'seller_1',
    status: 'pending',
    stripeSessionId: 'cs_test_123',
    items: [{ productId: 'prod_1', productName: 'Carrots', quantityOz: '16', pricePerOz: '0.5' }],
  };

  const mockBuyer = {
    id: 'buyer_1',
    name: 'Buyer Bob',
    email: 'bob@test.com',
    stripeAccountId: 'acct_1',
    lat: 30.0,
    lng: 23.9,
  };
  const mockSeller = {
    id: 'seller_1',
    name: 'Seller Sam',
    email: 'sam@test.com',
    stripeAccountId: 'acct_2',
    lat: 20.0,
    lng: 13.9,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully return order details for the buyer without sensitive fields', async () => {
    vi.mocked(orderRepository.getOrderWithItemsById).mockResolvedValueOnce(
      mockOrderWithItems as any,
    );
    vi.mocked(userRepository.findById)
      .mockResolvedValueOnce(mockBuyer as any) // first call (buyer)
      .mockResolvedValueOnce(mockSeller as any); // second call (seller)

    const result = await getOrderDetails('order_123', 'buyer_1');

    expect(orderRepository.getOrderWithItemsById).toHaveBeenCalledWith('order_123');
    expect(userRepository.findById).toHaveBeenCalledTimes(2);

    // Ensure stripeSessionId is stripped
    expect((result as any).stripeSessionId).toBeUndefined();
    expect(result.id).toBe('order_123');
    expect(result.items).toHaveLength(1);

    // Ensure sensitive user data is stripped
    expect(result.buyer?.name).toBe('Buyer Bob');
    expect(result.buyer?.location.lat).toBe(30.0);
    expect((result.buyer as any).stripeAccountId).toBeUndefined();
    expect(result.seller?.name).toBe('Seller Sam');
    expect(result.seller?.location.lat).toBe(20.0);
  });

  it('should successfully return order details for the seller', async () => {
    vi.mocked(orderRepository.getOrderWithItemsById).mockResolvedValueOnce(
      mockOrderWithItems as any,
    );
    vi.mocked(userRepository.findById).mockResolvedValue(null as any); // Mock users not found just to test safe fallbacks

    const result = await getOrderDetails('order_123', 'seller_1');

    expect(result.id).toBe('order_123');
    expect(result.buyer).toBeNull();
    expect(result.seller).toBeNull();
  });

  it('should throw an HTTPException 404 if the order does not exist', async () => {
    vi.mocked(orderRepository.getOrderWithItemsById).mockResolvedValueOnce(null);

    await expect(getOrderDetails('invalid_id', 'buyer_1')).rejects.toThrow(
      new HTTPException(404, { message: 'Order not found' }),
    );
  });

  it('should throw an HTTPException 404 if the requesting user is neither buyer nor seller', async () => {
    vi.mocked(orderRepository.getOrderWithItemsById).mockResolvedValueOnce(
      mockOrderWithItems as any,
    );

    await expect(getOrderDetails('order_123', 'random_hacker')).rejects.toThrow(
      new HTTPException(404, { message: 'Order not found' }),
    );
  });
});
