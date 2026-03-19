import { cartRepository } from '../repositories/cart.repository.js';
import type { AddToCartPayload } from '../schemas/cart.schema.js';

/**
 * Creates a new cart reservation for the authenticated buyer.
 * @param buyerId - User's unique ID injected by auth session
 * @param data - The add-to-cart payload from the request body
 * @returns The newly created cart reservation data
 */
export async function addToCart(buyerId: string, data: AddToCartPayload) {
  return await cartRepository.addToCart(buyerId, data);
}
