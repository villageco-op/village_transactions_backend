import { produceRepository } from '../repositories/produce.repository.js';
import type { CreateProducePayload, UpdateProducePayload } from '../schemas/produce.schema.js';

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
 * Updates an existing produce listing.
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
  return await produceRepository.update(id, sellerId, data);
}

/**
 * Soft deletes an existing produce listing.
 * @param id - The ID of the listing to delete
 * @param sellerId - User's unique ID injected by auth session
 * @returns A boolean representing success
 */
export async function deleteProduceListing(id: string, sellerId: string): Promise<boolean> {
  return await produceRepository.softDelete(id, sellerId);
}

/**
 * Retrieves a paginated list of produce items based on geographic coordinates and optional filters.
 * @param params - The configuration object for the produce search.
 * @param params.lat - The latitude of the user's current location.
 * @param params.lng - The longitude of the user's current location.
 * @param params.sortBy - The criteria used to order the results. Defaults to distance if not specified.
 * @param params.hasDelivery - A string-based boolean flag to filter items by delivery availability.
 * @param params.limit - The maximum number of items to return for pagination.
 * @param params.offset - The number of items to skip (used for pagination).
 * @returns A promise that resolves to an array of produce items, including a calculated
 * `thumbnail` from the image set and a normalized `distance` value.
 */
export async function getProduceList(params: {
  lat: number;
  lng: number;
  sortBy?: 'distance' | 'price';
  hasDelivery?: 'true' | 'false';
  limit: number;
  offset: number;
}) {
  const items = await produceRepository.getList(params);

  return items.map((item) => {
    const { images, ...rest } = item;
    return {
      ...rest,
      thumbnail: images && images.length > 0 ? images[0] : null,
      distance: Number(item.distance || 0),
    };
  });
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
 * Retrieves paginated orders for a specific produce listing.
 * @param produceId - The ID of the listing.
 * @param sellerId - The ID of the user requesting the orders (must be the seller).
 * @param limit - Pagination limit.
 * @param offset - Pagination offset.
 * @returns Array of orders or null if unauthorized/not found.
 */
export async function getProduceOrders(
  produceId: string,
  sellerId: string,
  limit: number,
  offset: number,
) {
  return await produceRepository.getProduceOrders(produceId, sellerId, limit, offset);
}

/**
 * Retrieves a paginated list of the authenticated seller's own produce listings.
 * @param sellerId - The ID of the authenticated seller.
 * @param params - Pagination and filtering configuration.
 * @param params.limit - The maximum number of items to return.
 * @param params.offset - The number of items to skip.
 * @param params.status - Optional status filter.
 * @returns Array of full produce details.
 */
export async function getSellerProduceListings(
  sellerId: string,
  params: { limit: number; offset: number; status?: 'active' | 'paused' | 'deleted' },
) {
  return await produceRepository.getSellerListings({
    sellerId,
    limit: params.limit,
    offset: params.offset,
    status: params.status,
  });
}
