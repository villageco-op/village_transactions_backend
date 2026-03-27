import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';
import { users, orders } from '../../../src/db/schema.js';

describe('ReviewRepository - Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  const BUYER_ID = 'buyer_repo_user';
  const SELLER_ID = 'seller_repo_user';
  const ORDER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

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
      { id: BUYER_ID, email: 'buyer.repo@example.com' },
      { id: SELLER_ID, email: 'seller.repo@example.com' },
    ]);

    await testDb.insert(orders).values({
      id: ORDER_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      paymentMethod: 'card',
      fulfillmentType: 'pickup',
      scheduledTime: new Date(),
      totalAmount: '25.00',
    });
  });

  it('should create a review successfully', async () => {
    const newReview = await reviewRepository.create({
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      orderId: ORDER_ID,
      rating: 4,
      comment: 'Pretty good apples',
    });

    expect(newReview).toBeDefined();
    expect(newReview?.id).toBeDefined();
    expect(newReview?.buyerId).toBe(BUYER_ID);
    expect(newReview?.rating).toBe(4);
    expect(newReview?.comment).toBe('Pretty good apples');
  });

  it('should find a review by order ID and buyer ID', async () => {
    await reviewRepository.create({
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      orderId: ORDER_ID,
      rating: 5,
    });

    const foundReview = await reviewRepository.findByOrderAndBuyer(ORDER_ID, BUYER_ID);

    expect(foundReview).toBeDefined();
    expect(foundReview?.orderId).toBe(ORDER_ID);
    expect(foundReview?.buyerId).toBe(BUYER_ID);
    expect(foundReview?.rating).toBe(5);
  });

  it('should return null if review does not exist', async () => {
    const foundReview = await reviewRepository.findByOrderAndBuyer(ORDER_ID, BUYER_ID);
    expect(foundReview).toBeNull();
  });
});
