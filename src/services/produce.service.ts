import { produceRepository } from '../repositories/produce.repository.js';
import type { CreateProducePayload } from '../schemas/produce.schema.js';

/**
 * Creates a new produce listing for the authenticated user.
 * @param sellerId - User's unique ID injected by auth session
 * @param data - The creation payload from the request body
 * @returns The newly created produce profile data
 */
export async function createProduceListing(sellerId: string, data: CreateProducePayload) {
  return await produceRepository.create(sellerId, data);
}
