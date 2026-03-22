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
