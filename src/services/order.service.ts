import { HTTPException } from 'hono/http-exception';

import { orderRepository } from '../repositories/order.repository.js';

import { sendPushNotification } from './notification.service.js';
import { refundCheckoutSession } from './stripe.service.js';

/**
 * Cancels a one-time order, restocks inventory, refunds the payment, and sends a notification.
 * @param orderId - The ID of the order to cancel
 * @param reason - The reason for cancellation provided by the user
 * @param requestingUserId - The ID of the user requesting the cancellation
 */
export async function cancelOrder(orderId: string, reason: string, requestingUserId: string) {
  const order = await orderRepository.getOrderById(orderId);

  if (!order) {
    throw new HTTPException(404, { message: 'Order not found' });
  }

  const isBuyer = order.buyerId === requestingUserId;
  const isSeller = order.sellerId === requestingUserId;

  if (!isBuyer && !isSeller) {
    throw new HTTPException(404, { message: 'Unauthorized' });
  }

  if (order.status === 'canceled') {
    return;
  }

  await orderRepository.updateOrderToCanceled(orderId, reason);

  if (order.stripeSessionId) {
    await refundCheckoutSession(order.stripeSessionId);
  }

  const targetUserId = order.buyerId === requestingUserId ? order.sellerId : order.buyerId;
  const role = order.buyerId === requestingUserId ? 'Buyer' : 'Seller';

  await sendPushNotification(
    targetUserId,
    'Order Canceled ❌',
    `The ${role.toLowerCase()} has canceled the order. Reason: ${reason}`,
  );
}
