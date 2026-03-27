import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { createReview } from '../../../src/services/review.service.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';

vi.mock('../../../src/repositories/review.repository.js', () => ({
  reviewRepository: {
    create: vi.fn(),
    findByOrderAndBuyer: vi.fn(),
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
