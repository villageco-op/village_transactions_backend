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

  describe('findReviewsBySellerId & countBySellerId', () => {
    const BUYER_1 = 'buyer_1';
    const BUYER_2 = 'buyer_2';
    const SELLER_ID = 'target_seller';

    beforeEach(async () => {
      await truncateTables(testDb);

      await testDb.insert(users).values([
        { id: BUYER_1, name: 'Alice', email: 'alice@example.com' },
        { id: BUYER_2, name: 'Bob', email: 'bob@example.com' },
        { id: SELLER_ID, email: 'target.seller@example.com' },
      ]);

      await testDb.insert(orders).values([
        {
          id: '11111111-1111-1111-1111-111111111111',
          buyerId: BUYER_1,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          buyerId: BUYER_2,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          buyerId: BUYER_1,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
      ]);

      await reviewRepository.create({
        buyerId: BUYER_1,
        sellerId: SELLER_ID,
        orderId: '11111111-1111-1111-1111-111111111111',
        rating: 3,
        comment: 'Okay',
      });
      await reviewRepository.create({
        buyerId: BUYER_2,
        sellerId: SELLER_ID,
        orderId: '22222222-2222-2222-2222-222222222222',
        rating: 5,
        comment: 'Perfect',
      });
      await reviewRepository.create({
        buyerId: BUYER_1,
        sellerId: SELLER_ID,
        orderId: '33333333-3333-3333-3333-333333333333',
        rating: 1,
        comment: 'Terrible',
      });
    });

    it('should correctly count the number of reviews for a seller', async () => {
      const count = await reviewRepository.countBySellerId(SELLER_ID);
      expect(count).toBe(3);
    });

    it('should sort by rating descending', async () => {
      const results = await reviewRepository.findReviewsBySellerId(SELLER_ID, {
        limit: 10,
        offset: 0,
        sortBy: 'rating',
        sortOrder: 'desc',
      });

      expect(results).toHaveLength(3);
      expect(results[0].rating).toBe(5); // Bob's review
      expect(results[0].buyer?.name).toBe('Bob');
      expect(results[1].rating).toBe(3); // Alice's first review
      expect(results[2].rating).toBe(1); // Alice's second review
    });

    it('should respect pagination offset and limit', async () => {
      const page1 = await reviewRepository.findReviewsBySellerId(SELLER_ID, {
        limit: 2,
        offset: 0,
        sortBy: 'rating',
        sortOrder: 'asc',
      });
      expect(page1).toHaveLength(2);
      expect(page1[0].rating).toBe(1);
      expect(page1[1].rating).toBe(3);

      const page2 = await reviewRepository.findReviewsBySellerId(SELLER_ID, {
        limit: 2,
        offset: 2,
        sortBy: 'rating',
        sortOrder: 'asc',
      });
      expect(page2).toHaveLength(1);
      expect(page2[0].rating).toBe(5);
    });
  });

  describe('getReviewStatsBySellerId', () => {
    const STATS_SELLER_ID = 'stats_seller';
    const STATS_BUYER_1 = 'stats_buyer_1';
    const STATS_BUYER_2 = 'stats_buyer_2';

    beforeEach(async () => {
      await truncateTables(testDb);

      await testDb.insert(users).values([
        { id: STATS_SELLER_ID, email: 'stats.seller@example.com' },
        { id: STATS_BUYER_1, email: 'stats.b1@example.com' },
        { id: STATS_BUYER_2, email: 'stats.b2@example.com' },
      ]);

      await testDb.insert(orders).values([
        {
          id: '11111111-1111-1111-1111-111111111111',
          buyerId: STATS_BUYER_1,
          sellerId: STATS_SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          buyerId: STATS_BUYER_2,
          sellerId: STATS_SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          buyerId: STATS_BUYER_1,
          sellerId: STATS_SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
      ]);

      await reviewRepository.create({
        buyerId: STATS_BUYER_1,
        sellerId: STATS_SELLER_ID,
        orderId: '11111111-1111-1111-1111-111111111111',
        rating: 5,
        comment: 'Great',
      });
      await reviewRepository.create({
        buyerId: STATS_BUYER_2,
        sellerId: STATS_SELLER_ID,
        orderId: '22222222-2222-2222-2222-222222222222',
        rating: 5,
        comment: 'Awesome',
      });
      await reviewRepository.create({
        buyerId: STATS_BUYER_1,
        sellerId: STATS_SELLER_ID,
        orderId: '33333333-3333-3333-3333-333333333333',
        rating: 3,
        comment: 'Okay',
      });
    });

    it('should aggregate review counts grouped by rating', async () => {
      const stats = await reviewRepository.getReviewStatsBySellerId(STATS_SELLER_ID);

      // Should have two groups: 5-star (count 2) and 3-star (count 1)
      expect(stats).toHaveLength(2);

      const fiveStar = stats.find((s) => s.rating === 5);
      const threeStar = stats.find((s) => s.rating === 3);

      expect(fiveStar?.count).toBe(2);
      expect(threeStar?.count).toBe(1);
    });

    it('should return an empty array if a seller has no reviews', async () => {
      const stats = await reviewRepository.getReviewStatsBySellerId('ghost_seller');
      expect(stats).toEqual([]);
    });
  });
});
