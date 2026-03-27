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
