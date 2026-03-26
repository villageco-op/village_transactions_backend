import { HTTPException } from 'hono/http-exception';

import { reviewRepository } from '../repositories/review.repository.js';
import type { CreateReviewPayload, GetSellerReviewsQuery } from '../schemas/review.schema.js';

/**
 * Creates a new review for an order.
 * @param buyerId - User's unique ID injected by auth session
 * @param data - The review data payload from the request body
 * @returns The created review record
 */
export async function createReview(buyerId: string, data: CreateReviewPayload) {
  const existingReview = await reviewRepository.findByOrderAndBuyer(data.orderId, buyerId);

  if (existingReview) {
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
    throw new HTTPException(500, { message: 'Failed to create review' });
  }

  return review;
}

/**
 * Retrieves a paginated list of reviews for a seller.
 * @param sellerId - The ID of the seller to fetch reviews for
 * @param query - Pagination and sorting options
 * @returns A list of reviews and pagination details
 */
export async function getSellerReviews(sellerId: string, query: GetSellerReviewsQuery) {
  const { page, limit, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const [items, total] = await Promise.all([
    reviewRepository.findReviewsBySellerId(sellerId, { limit, offset, sortBy, sortOrder }),
    reviewRepository.countBySellerId(sellerId),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    reviews: items.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}
