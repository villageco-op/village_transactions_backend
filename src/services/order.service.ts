import { HTTPException } from 'hono/http-exception';

import type { OrderStatus } from '../db/types.js';
import { orderRepository } from '../repositories/order.repository.js';
import { userRepository } from '../repositories/user.repository.js';

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
 * Finds all pending orders containing a specific product and cancels them.
 * Used when a seller deletes a product or marks it unavailable before fulfilling orders.
 * @param productId - The ID of the affected product
 * @param reason - The cancellation reason
 * @param requestingUserId - The seller's ID initiating the cancellation
 */
export async function batchCancelPendingOrders(
  productId: string,
  reason: string,
  requestingUserId: string,
) {
  const pendingOrderIds = await orderRepository.getPendingOrdersByProductId(productId);

  const results = await Promise.allSettled(
    pendingOrderIds.map((orderId) => cancelOrder(orderId, reason, requestingUserId)),
  );

  // Check for any stragglers that didn't cancel correctly
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(
      `Batch cancellation completed with ${failures.length} failures out of ${pendingOrderIds.length} orders.`,
    );
  }
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
 * Gets historical or active orders for a user with pagination.
 * @param userId - The ID of the user requesting their orders
 * @param role - Whether the user is acting as a 'buyer' or 'seller'
 * @param status - Optional status to filter by
 * @param timeframe - Optional timeframe string (e.g. "30days")
 * @param page - Current page number
 * @param limit - Number of records per page
 * @param offset - Offset index for database query
 * @returns Paginated list of orders
 */
export async function getOrders(
  userId: string,
  role: 'buyer' | 'seller',
  status: OrderStatus | undefined,
  timeframe: string | undefined,
  page: number,
  limit: number,
  offset: number,
) {
  let timeframeDays: number | undefined;

  if (timeframe) {
    const match = timeframe.match(/^(\d+)days$/);
    if (match) {
      timeframeDays = parseInt(match[1], 10);
    }
  }

  const { items, total } = await orderRepository.getOrders({
    userId,
    role,
    status,
    timeframeDays,
    limit,
    offset,
  });

  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / (limit || 1)),
    },
  };
}

/**
 * Gets formatted payout line items for the seller based on a specific rolling timeframe with pagination.
 * @param sellerId - User's (Seller's) unique ID
 * @param timeframe - e.g. "90days"
 * @param page - Current page number
 * @param limit - Number of records per page
 * @param offset - Offset index for database query
 * @returns Standardized paginated response of payout records
 */
export async function getSellerPayouts(
  sellerId: string,
  timeframe: string,
  page: number,
  limit: number,
  offset: number,
) {
  const daysMatch = timeframe.match(/^(\d+)days$/);
  const days = daysMatch ? parseInt(daysMatch[1], 10) : 90;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { items, total } = await orderRepository.getPayoutHistory(
    sellerId,
    startDate,
    limit,
    offset,
  );

  const data = items.map((row) => {
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

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / (limit || 1)),
    },
  };
}

/**
 * Retrieves comprehensive details of a specific order.
 * Ensures the requesting user is either the buyer or the seller.
 * @param orderId - The ID of the order
 * @param requestingUserId - The ID of the authenticated user
 * @returns Full order data with order items and buyer and seller info
 */
export async function getOrderDetails(orderId: string, requestingUserId: string) {
  const orderData = await orderRepository.getOrderWithItemsById(orderId);

  if (!orderData) {
    throw new HTTPException(404, { message: 'Order not found' });
  }

  const isBuyer = orderData.buyerId === requestingUserId;
  const isSeller = orderData.sellerId === requestingUserId;

  if (!isBuyer && !isSeller) {
    throw new HTTPException(404, { message: 'Order not found' });
  }

  const [buyerData, sellerData] = await Promise.all([
    userRepository.findById(orderData.buyerId),
    userRepository.findById(orderData.sellerId),
  ]);

  const safeBuyer = buyerData
    ? {
        id: buyerData.id,
        name: buyerData.name,
        email: buyerData.email,
        location: {
          lat: buyerData.lat ?? null,
          lng: buyerData.lng ?? null,
          address: buyerData.address ?? null,
          city: buyerData.city ?? null,
          state: buyerData.state ?? null,
          country: buyerData.country ?? null,
          zip: buyerData.zip ?? null,
        },
      }
    : null;

  const safeSeller = sellerData
    ? {
        id: sellerData.id,
        name: sellerData.name,
        email: sellerData.email,
        location: {
          lat: sellerData.lat ?? null,
          lng: sellerData.lng ?? null,
          address: sellerData.address ?? null,
          city: sellerData.city ?? null,
          state: sellerData.state ?? null,
          country: sellerData.country ?? null,
          zip: sellerData.zip ?? null,
        },
      }
    : null;

  const { stripeSessionId: _stripeSessionId, ...safeOrderData } = orderData;

  return {
    ...safeOrderData,
    buyer: safeBuyer,
    seller: safeSeller,
  };
}
