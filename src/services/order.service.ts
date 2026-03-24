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

/**
 * Reschedules an order to a new time and sends a notification to the other party.
 * @param orderId - The ID of the order to reschedule
 * @param newTime - The new scheduled time string (ISO 8601)
 * @param requestingUserId - The ID of the user requesting the change
 */
export async function rescheduleOrder(orderId: string, newTime: string, requestingUserId: string) {
  const order = await orderRepository.getOrderById(orderId);

  if (!order) {
    throw new HTTPException(404, { message: 'Order not found' });
  }

  const isBuyer = order.buyerId === requestingUserId;
  const isSeller = order.sellerId === requestingUserId;

  if (!isBuyer && !isSeller) {
    throw new HTTPException(404, { message: 'Unauthorized' });
  }

  if (order.status !== 'pending') {
    throw new HTTPException(400, { message: 'Only pending orders can be rescheduled' });
  }

  const newScheduledTime = new Date(newTime);
  await orderRepository.updateOrderScheduleTime(orderId, newScheduledTime);

  const targetUserId = isBuyer ? order.sellerId : order.buyerId;
  const role = isBuyer ? 'Buyer' : 'Seller';

  const dateString = newScheduledTime.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  await sendPushNotification(
    targetUserId,
    'Order Rescheduled 🕒',
    `The ${role.toLowerCase()} has requested a new time for your order: ${dateString}.`,
  );
}

/**
 * Gets historical or active orders for a user.
 * @param userId - The ID of the user requesting their orders
 * @param role - Whether the user is acting as a 'buyer' or 'seller'
 * @param status - Optional status to filter by
 * @param timeframe - Optional timeframe string (e.g. "30days")
 * @returns List of orders
 */
export async function getOrders(
  userId: string,
  role: 'buyer' | 'seller',
  status?: 'pending' | 'completed' | 'canceled',
  timeframe?: string,
) {
  let timeframeDays: number | undefined;

  if (timeframe) {
    const match = timeframe.match(/^(\d+)days$/);
    if (match) {
      timeframeDays = parseInt(match[1], 10);
    }
  }

  return await orderRepository.getOrders({
    userId,
    role,
    status,
    timeframeDays,
  });
}

/**
 * Gets formatted payout line items for the seller based on a specific rolling timeframe.
 * @param sellerId - User's (Seller's) unique ID
 * @param timeframe - e.g. "90days"
 * @returns Formatted array of payout records
 */
export async function getSellerPayouts(sellerId: string, timeframe: string) {
  const daysMatch = timeframe.match(/^(\d+)days$/);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 90;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rows = await orderRepository.getPayoutHistory(sellerId, startDate);

  return rows.map((row) => {
    const qtyOz = Number(row.quantityOz);
    const price = Number(row.pricePerOz);

    return {
      date: row.date?.toISOString() ?? new Date().toISOString(),
      buyerName: row.buyerName ?? 'Unknown',
      productName: row.productName ?? 'Unknown',
      quantityLbs: Number((qtyOz / 16).toFixed(2)),
      amountDollars: Number((qtyOz * price).toFixed(2)),
    };
  });
}
