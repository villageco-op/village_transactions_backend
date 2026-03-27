import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';
import { users, orders, reviews } from '../../../src/db/schema.js';

describe('Reviews API Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  const TEST_BUYER_ID = 'auth_buyer_user_123';
  const TEST_SELLER_ID = 'auth_seller_user_456';
  const TEST_ORDER_ID = '123e4567-e89b-12d3-a456-426614174000';

  beforeAll(() => {
    testDb = getTestDb();
    reviewRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);

    await testDb.insert(users).values([
      { id: TEST_BUYER_ID, email: 'buyer.api@example.com' },
      { id: TEST_SELLER_ID, email: 'seller.api@example.com' },
    ]);

    await testDb.insert(orders).values({
      id: TEST_ORDER_ID,
      buyerId: TEST_BUYER_ID,
      sellerId: TEST_SELLER_ID,
      paymentMethod: 'card',
      fulfillmentType: 'pickup',
      scheduledTime: new Date(),
      totalAmount: '15.50',
    });
  });

  it('POST /api/reviews should return 201 and insert review to DB', async () => {
    const payload = {
      sellerId: TEST_SELLER_ID,
      orderId: TEST_ORDER_ID,
      rating: 5,
      comment: 'Amazing fresh veggies!',
    };

    const res = await authedRequest(
      '/api/reviews',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('reviewId');

    const dbReviews = await testDb.select().from(reviews).where(eq(reviews.orderId, TEST_ORDER_ID));

    expect(dbReviews).toHaveLength(1);
    expect(dbReviews[0].rating).toBe(5);
    expect(dbReviews[0].comment).toBe('Amazing fresh veggies!');
    expect(dbReviews[0].buyerId).toBe(TEST_BUYER_ID);
  });

  it('POST /api/reviews should return 400 if user tries to review the same order twice', async () => {
    await reviewRepository.create({
      buyerId: TEST_BUYER_ID,
      sellerId: TEST_SELLER_ID,
      orderId: TEST_ORDER_ID,
      rating: 4,
    });

    const payload = {
      sellerId: TEST_SELLER_ID,
      orderId: TEST_ORDER_ID,
      rating: 3,
      comment: 'Changing my mind',
    };

    const res = await authedRequest(
      '/api/reviews',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'A review already exists for this order');
  });

  it('POST /api/reviews should return 400 validation error if rating is out of bounds', async () => {
    const payload = {
      sellerId: TEST_SELLER_ID,
      orderId: TEST_ORDER_ID,
      rating: 6, // Invalid rating, should be 1-5
    };

    const res = await authedRequest(
      '/api/reviews',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(400);
  });

  it('POST /api/reviews should return 400 validation error if orderId is not a valid UUID', async () => {
    const payload = {
      sellerId: TEST_SELLER_ID,
      orderId: 'not-a-uuid',
      rating: 5,
    };

    const res = await authedRequest(
      '/api/reviews',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_BUYER_ID },
    );

    expect(res.status).toBe(400);
  });
});
