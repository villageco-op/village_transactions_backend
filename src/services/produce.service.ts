import { orderRepository } from '../repositories/order.repository.js';
import { produceRepository } from '../repositories/produce.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import type { CreateProducePayload, UpdateProducePayload } from '../schemas/produce.schema.js';

import { batchCancelPendingOrders } from './order.service.js';
import { batchCancelProductSubscriptions } from './subscription.service.js';

/**
 * Creates a new produce listing for the authenticated user.
 * @param sellerId - User's unique ID injected by auth session
 * @param data - The creation payload from the request body
 * @returns The newly created produce profile data
 */
export async function createProduceListing(sellerId: string, data: CreateProducePayload) {
  return await produceRepository.create(sellerId, data);
}

/**
 * Updates an existing produce listing and deletes subscriptions and pending orders if necessary.
 * @param id - The ID of the listing to update
 * @param sellerId - User's unique ID injected by auth session
 * @param data - The partial update payload from the request body
 * @returns The updated produce profile data
 */
export async function updateProduceListing(
  id: string,
  sellerId: string,
  data: UpdateProducePayload,
) {
  const oldProduce = await produceRepository.getById(id);
  if (!oldProduce || oldProduce.sellerId !== sellerId) return null;

  const { cancelExistingSubscriptions, ...dbPayload } = data;

  const updatedProduce = await produceRepository.update(id, sellerId, dbPayload);

  const frequencyChanged =
    data.harvestFrequencyDays !== undefined &&
    data.harvestFrequencyDays !== oldProduce.harvestFrequencyDays;
  const subscriptionTurnedOff = data.isSubscribable === false && oldProduce.isSubscribable === true;
  const statusChangedToDeleted = data.status === 'deleted' || data.status === 'paused';

  const shouldCancelSubs =
    cancelExistingSubscriptions ||
    frequencyChanged ||
    subscriptionTurnedOff ||
    statusChangedToDeleted;

  if (shouldCancelSubs) {
    let reason =
      'The farmer made a significant update to this listing, requiring you to re-subscribe.';
    if (subscriptionTurnedOff)
      reason = 'This item is no longer available for recurring subscriptions.';
    if (frequencyChanged) reason = 'The farmer changed the harvest frequency for this item.';
    if (statusChangedToDeleted) reason = 'This item is currently unavailable.';

    batchCancelProductSubscriptions(id, reason).catch(console.error);
  }

  if (statusChangedToDeleted) {
    batchCancelPendingOrders(id, 'An item in your order is no longer available.', sellerId).catch(
      console.error,
    );
  }

  return updatedProduce;
}

/**
 * Soft deletes an existing produce listing and cancels all related subscriptions.
 * @param id - The ID of the listing to delete
 * @param sellerId - User's unique ID injected by auth session
 * @returns A boolean representing success
 */
export async function deleteProduceListing(id: string, sellerId: string): Promise<boolean> {
  const success = await produceRepository.softDelete(id, sellerId);

  if (success) {
    const reason = 'The farmer removed an item in this order from their shop.';

    Promise.allSettled([
      batchCancelProductSubscriptions(id, reason),
      batchCancelPendingOrders(id, reason, sellerId),
    ]).catch(console.error);
  }

  return success;
}

/**
 * Retrieves a paginated list of produce items based on geographic coordinates and optional filters.
 * @param params - The configuration object for the produce search.
 * @param params.lat - The latitude of the user's current location.
 * @param params.lng - The longitude of the user's current location.
 * @param params.sortBy - The criteria used to order the results. Defaults to distance if not specified.
 * @param params.hasDelivery - A string-based boolean flag to filter items by delivery availability.
 * @param params.page - Current page number.
 * @param params.limit - The maximum number of items to return for pagination.
 * @param params.offset - The number of items to skip (used for pagination).
 * @returns A promise that resolves to a paginated response object containing the mapped produce items.
 */
export async function getProduceList(params: {
  lat: number;
  lng: number;
  sortBy?: 'distance' | 'price';
  hasDelivery?: 'true' | 'false';
  page: number;
  limit: number;
  offset: number;
}) {
  const { items, total } = await produceRepository.getList(params);

  const data = items.map((item) => {
    const { images, ...rest } = item;
    return {
      ...rest,
      thumbnail: images && images.length > 0 ? images[0] : null,
      distance: Number(item.distance || 0),
    };
  });

  return {
    data,
    meta: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / (params.limit || 1)),
    },
  };
}

/**
 * Retrieves listings formatted for a map view, grouped by seller.
 * This function takes flat produce data and transforms it into a seller-centric
 * structure, making it easier to render map markers that represent multiple items.
 * @param params - The configuration object for the produce map search.
 * @param params.lat - The center latitude for the search radius.
 * @param params.lng - The center longitude for the search radius.
 * @param params.radiusMiles - The circular search boundary in miles.
 * @param params.produceType - Optional filter for specific categories (e.g., 'vegetable').
 * @param params.hasDelivery - If 'true', only returns items within the seller's delivery range.
 * @param params.maxPrice - The upper price limit per ounce.
 * @returns A promise resolving to an array of grouped objects, where each object contains
 * a seller's ID, their geographic coordinates, and a list of their available produce.
 */
export async function getProduceMap(params: {
  lat: number;
  lng: number;
  radiusMiles?: number;
  produceType?: string;
  hasDelivery?: 'true' | 'false';
  maxPrice?: number;
}) {
  const items = await produceRepository.getMapItems(params);

  const sellerGroups = new Map<
    string,
    {
      sellerId: string;
      lat: number;
      lng: number;
      produce: { id: string; name: string; thumbnail: string | null }[];
    }
  >();

  for (const item of items) {
    if (!sellerGroups.has(item.sellerId)) {
      sellerGroups.set(item.sellerId, {
        sellerId: item.sellerId,
        lat: item.lat,
        lng: item.lng,
        produce: [],
      });
    }

    const group = sellerGroups.get(item.sellerId)!;
    group.produce.push({
      id: item.id,
      name: item.name,
      thumbnail: item.images && item.images.length > 0 ? item.images[0] : null,
    });
  }

  return Array.from(sellerGroups.values());
}

/**
 * Retrieves paginated orders for a specific produce listing with standardized metadata
 * and in depth per listing analytics.
 * @param produceId - The ID of the listing.
 * @param sellerId - The ID of the user requesting the orders (must be the seller).
 * @param page - Current page number.
 * @param limit - Pagination limit.
 * @param offset - Pagination offset.
 * @returns Standardized paginated response or null if unauthorized/not found.
 */
export async function getProduceOrders(
  produceId: string,
  sellerId: string,
  page: number,
  limit: number,
  offset: number,
) {
  const result = await produceRepository.getProduceOrders(produceId, sellerId, limit, offset);

  if (!result) {
    return null;
  }

  const { items, total } = result;

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
 * Retrieves a paginated list of the authenticated seller's own produce listings.
 * @param sellerId - The ID of the authenticated seller.
 * @param params - Pagination and filtering configuration.
 * @param params.page - Current page number.
 * @param params.limit - The maximum number of items to return.
 * @param params.offset - The number of items to skip.
 * @param params.status - Optional status filter.
 * @returns Standardized paginated response with full produce details and analytics data.
 */
export async function getSellerProduceListings(
  sellerId: string,
  params: { page: number; limit: number; offset: number; status?: 'active' | 'paused' | 'deleted' },
) {
  const { items, total } = await produceRepository.getSellerListings({
    sellerId,
    limit: params.limit,
    offset: params.offset,
    status: params.status,
  });

  if (!items || items.length === 0) {
    return {
      data: [],
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / (params.limit || 1)),
      },
    };
  }

  const productIds = items.map((i) => i.id);
  const [ordersData, subsData] = await Promise.all([
    orderRepository.getAnalyticsForProducts(productIds),
    subscriptionRepository.getActiveSubscriptionsForProducts(productIds),
  ]);

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const enrichedItems = items.map((item) => {
    const itemOrders = ordersData.filter((o) => o.productId === item.id);
    const itemSubs = subsData.filter((s) => s.productId === item.id);

    let totalOzSold = 0;
    let totalMonthlyEarnings = 0;
    let pendingOrderOz = 0;
    const uniqueOrders = new Set();

    for (const o of itemOrders) {
      if (o.status !== 'canceled') {
        uniqueOrders.add(o.orderId);
      }
      if (o.status === 'completed') {
        totalOzSold += Number(o.quantityOz);
        // Only count within last 30 days for monthly earnings
        if (o.createdAt && new Date(o.createdAt) >= thirtyDaysAgo) {
          totalMonthlyEarnings += Number(o.quantityOz) * Number(o.pricePerOz);
        }
      } else if (o.status === 'pending') {
        pendingOrderOz += Number(o.quantityOz);
      }
    }

    let activeSubscriptionOz = 0;
    for (const s of itemSubs) {
      activeSubscriptionOz += Number(s.quantityOz);
    }

    const totalOzInventory = Number(item.totalOzInventory);

    let percentSold = 0;
    if (totalOzInventory > 0) {
      percentSold = ((pendingOrderOz + activeSubscriptionOz) / totalOzInventory) * 100;
    }

    const availableInventory = totalOzInventory - pendingOrderOz;

    let nextHarvest = new Date(item.availableBy);
    if (item.harvestFrequencyDays && item.harvestFrequencyDays > 0) {
      while (nextHarvest < now) {
        nextHarvest.setDate(nextHarvest.getDate() + item.harvestFrequencyDays);
      }
    }

    let upcomingSubscriptionOzNeeded = 0;
    for (const s of itemSubs) {
      if (s.nextDeliveryDate && new Date(s.nextDeliveryDate) < nextHarvest) {
        upcomingSubscriptionOzNeeded += Number(s.quantityOz);
      }
    }

    const inventorySufficientForUpcoming = availableInventory >= upcomingSubscriptionOzNeeded;

    return {
      ...item,
      analytics: {
        totalOzSold,
        totalMonthlyEarnings,
        numberOfSubscriptions: itemSubs.length,
        numberOfOrders: uniqueOrders.size,
        percentSold: Number(percentSold.toFixed(2)),
        upcomingSubscriptionOzNeeded,
        availableInventory,
        inventorySufficientForUpcoming,
        nextHarvestDate: nextHarvest.toISOString(),
      },
    };
  });

  return {
    data: enrichedItems,
    meta: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / (params.limit || 1)),
    },
  };
}

/**
 * Retrieves details for a specific produce listing.
 * @param id - The ID of the listing to retrieve
 * @returns The produce listing with seller details, or undefined if not found
 */
export async function getProduceListing(id: string) {
  return await produceRepository.getById(id);
}
