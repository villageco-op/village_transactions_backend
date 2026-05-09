import { HTTPException } from 'hono/http-exception';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { reviewRepository } from '../repositories/review.repository.js';
import type { CreateReviewPayload, GetSellerReviewsQuery } from '../schemas/review.schema.js';

/**
 * Creates a new review for an order.
 * @param buyerId - User's unique ID injected by auth session
 * @param data - The review data payload from the request body
 * @param log - App logger that defaults to a blank logger
 * @returns The created review record
 */
export async function createReview(
  buyerId: string,
  data: CreateReviewPayload,
  log: AppLogger = noopLogger,
) {
  const existingReview = await reviewRepository.findByOrderAndBuyer(data.orderId, buyerId);

  if (existingReview) {
    log.warn({ existingReviewId: existingReview.id }, 'User attempted to review an order twice');
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
    log.error('Database failed to return review object after creation');
    throw new HTTPException(500, { message: 'Failed to create review' });
  }

  return review;
}

/**
 * Retrieves a paginated list of reviews for a seller.
 * @param sellerId - The ID of the seller to fetch reviews for
 * @param query - Pagination and sorting options
 * @param log - App logger that defaults to a blank logger
 * @returns A list of reviews and pagination details
 */
export async function getSellerReviews(
  sellerId: string,
  query: GetSellerReviewsQuery,
  log: AppLogger = noopLogger,
) {
  const { page, limit, sortBy, sortOrder } = query;
  const offset = (page - 1) * limit;

  const [items, total] = await Promise.all([
    reviewRepository.findReviewsBySellerId(sellerId, { limit, offset, sortBy, sortOrder }),
    reviewRepository.countBySellerId(sellerId),
  ]);

  const totalPages = Math.ceil(total / limit);

  log.debug({ count: items.length, total, page }, 'Fetched seller reviews');

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
