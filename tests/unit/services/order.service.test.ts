import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { cancelOrder } from '../../../src/services/order.service.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { refundCheckoutSession } from '../../../src/services/stripe.service.js';
import { sendPushNotification } from '../../../src/services/notification.service.js';

vi.mock('../../../src/repositories/order.repository.js', () => ({
  orderRepository: {
    getOrderById: vi.fn(),
    updateOrderToCanceled: vi.fn(),
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
