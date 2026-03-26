import { HTTPException } from 'hono/http-exception';

import { reviewRepository } from '../repositories/review.repository.js';
import type { CreateReviewPayload } from '../schemas/review.schema.js';

/**
 * Creates a new review for an order.
 * @param buyerId - User's unique ID injected by auth session
 * @param data - The review data payload from the request body
 * @returns The created review record
 */
export async function createReview(buyerId: string, data: CreateReviewPayload) {
  const existingReview = await reviewRepository.findByOrderAndBuyer(data.orderId, buyerId);

  if (existingReview) {
    console.log(existingReview);
    throw new HTTPException(400, { message: 'A review already exists for this order' });
  }

  const review = await reviewRepository.create({
    buyerId,
    sellerId: data.sellerId,
    orderId: data.orderId,
    rating: data.rating,
    comment: data.comment,
  });

  if (!review) {
    console.log('failed to create review');
    throw new HTTPException(500, { message: 'Failed to create review' });
  }

  return review;
}
