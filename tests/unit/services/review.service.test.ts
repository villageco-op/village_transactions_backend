import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { createReview, getSellerReviews } from '../../../src/services/review.service.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';

vi.mock('../../../src/repositories/review.repository.js', () => ({
  reviewRepository: {
    create: vi.fn(),
    findByOrderAndBuyer: vi.fn(),
    findReviewsBySellerId: vi.fn(),
    countBySellerId: vi.fn(),
  },
}));

describe('ReviewService - createReview', () => {
  const mockBuyerId = 'buyer_123';
  const mockPayload = {
    sellerId: 'seller_456',
    orderId: '123e4567-e89b-12d3-a456-426614174000',
    rating: 5,
    comment: 'Great produce!',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 400 HTTPException if a review already exists for this order', async () => {
    vi.mocked(reviewRepository.findByOrderAndBuyer).mockResolvedValue({
      id: 'existing_review_id',
      ...mockPayload,
      buyerId: mockBuyerId,
    } as any);

    await expect(createReview(mockBuyerId, mockPayload)).rejects.toThrow(HTTPException);
    await expect(createReview(mockBuyerId, mockPayload)).rejects.toMatchObject({ status: 400 });

    expect(reviewRepository.findByOrderAndBuyer).toHaveBeenCalledWith(
      mockPayload.orderId,
      mockBuyerId,
    );
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('should throw a 500 HTTPException if the review insertion fails', async () => {
    vi.mocked(reviewRepository.findByOrderAndBuyer).mockResolvedValue(null as any);
    vi.mocked(reviewRepository.create).mockResolvedValueOnce(null as any);

    await expect(createReview(mockBuyerId, mockPayload)).rejects.toThrow(HTTPException);
    await expect(createReview(mockBuyerId, mockPayload)).rejects.toMatchObject({ status: 500 });

    expect(reviewRepository.create).toHaveBeenCalledWith({
      buyerId: mockBuyerId,
      sellerId: mockPayload.sellerId,
      orderId: mockPayload.orderId,
      rating: mockPayload.rating,
      comment: mockPayload.comment,
    });
  });

  it('should create and return the review successfully', async () => {
    vi.mocked(reviewRepository.findByOrderAndBuyer).mockResolvedValue(null as any);

    const mockCreatedReview = {
      id: 'new_review_id',
      buyerId: mockBuyerId,
      ...mockPayload,
    };

    vi.mocked(reviewRepository.create).mockResolvedValueOnce(mockCreatedReview as any);

    const result = await createReview(mockBuyerId, mockPayload);

    expect(result).toEqual(mockCreatedReview);
    expect(reviewRepository.findByOrderAndBuyer).toHaveBeenCalledWith(
      mockPayload.orderId,
      mockBuyerId,
    );
    expect(reviewRepository.create).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewService - getSellerReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a correctly paginated response structure', async () => {
    const mockDate = new Date('2024-01-01T00:00:00Z');

    vi.mocked(reviewRepository.countBySellerId).mockResolvedValueOnce(25);
    vi.mocked(reviewRepository.findReviewsBySellerId).mockResolvedValueOnce([
      {
        id: 'review_1',
        rating: 5,
        comment: 'Great',
        createdAt: mockDate,
        buyer: { id: 'buyer_1', name: 'Alice', image: null },
      },
    ]);

    const query = { page: 2, limit: 10, sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
    const result = await getSellerReviews('seller_123', query);

    // Assert pagination math
    expect(reviewRepository.findReviewsBySellerId).toHaveBeenCalledWith('seller_123', {
      limit: 10,
      offset: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result).toEqual({
      reviews: [
        {
          id: 'review_1',
          rating: 5,
          comment: 'Great',
          createdAt: '2024-01-01T00:00:00.000Z',
          buyer: { id: 'buyer_1', name: 'Alice', image: null },
        },
      ],
      pagination: {
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      },
    });
  });

  it('should return empty array if seller has no reviews', async () => {
    vi.mocked(reviewRepository.countBySellerId).mockResolvedValueOnce(0);
    vi.mocked(reviewRepository.findReviewsBySellerId).mockResolvedValueOnce([]);

    const query = { page: 1, limit: 10, sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
    const result = await getSellerReviews('ghost_seller', query);

    expect(result.reviews).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });
});
