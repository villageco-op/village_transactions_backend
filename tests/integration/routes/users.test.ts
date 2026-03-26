import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { scheduleRuleRepository } from '../../../src/repositories/schedule-rule.repository.js';
import { users, fcmTokens, scheduleRules, orders, reviews } from '../../../src/db/schema.js';
import { orderRepository } from '../../../src/repositories/order.repository.js';
import { reviewRepository } from '../../../src/repositories/review.repository.js';
import { request } from '../../test-utils/request.js';

describe('Users API Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  const TEST_USER_ID = 'test_auth_user_123';

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
    scheduleRuleRepository.setDb(testDb);
    orderRepository.setDb(testDb);
    reviewRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
  });

  it('GET /api/users/me should return 200 and sanitized profile data', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      name: 'Jane Api User',
      email: 'jane.api@example.com',
      passwordHash: 'super_secret_do_not_leak',
      aboutMe: 'A short bio here.',
      specialties: ['lettuce', 'kale'],
      goal: '150.00',
      address: '101 Api Blvd',
      stripeAccountId: 'acct_api_123',
    });

    const res = await authedRequest('/api/users/me', {}, { id: TEST_USER_ID });

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body).toHaveProperty('id', TEST_USER_ID);
    expect(body).toHaveProperty('name', 'Jane Api User');
    expect(body).toHaveProperty('email', 'jane.api@example.com');
    expect(body).toHaveProperty('aboutMe', 'A short bio here.');
    expect(body).toHaveProperty('specialties', ['lettuce', 'kale']);
    expect(body).toHaveProperty('goal', '150.00');
    expect(body).toHaveProperty('address', '101 Api Blvd');
    expect(body).toHaveProperty('stripeAccountId', 'acct_api_123');

    expect(body).not.toHaveProperty('passwordHash');
  });

  it('GET /api/users/me should return 404 if the authenticated user does not exist in DB', async () => {
    const res = await authedRequest('/api/users/me');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'User not found');
  });

  it('PUT /api/users/me should update user in DB and return 200 success', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      name: 'Old Api Name',
      email: 'update.api@example.com',
      passwordHash: 'secret',
      address: 'Old Address',
    });

    const res = await authedRequest(
      '/api/users/me',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'John Doe',
          aboutMe: 'Updated bio from API',
          specialties: ['squash', 'pumpkins'],
          goal: 2000.5,
          address: '123 Main St',
          city: 'Timbuktu',
          lat: 45.0,
          lng: -90.0,
          deliveryRangeMiles: 10,
        }),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const updatedDbUser = await userRepository.findById(TEST_USER_ID);
    expect(updatedDbUser?.name).toBe('John Doe');
    expect(updatedDbUser?.aboutMe).toBe('Updated bio from API');
    expect(updatedDbUser?.specialties).toEqual(['squash', 'pumpkins']);
    expect(updatedDbUser?.goal).toBe('2000.50');
    expect(updatedDbUser?.address).toBe('123 Main St');
    expect(updatedDbUser?.deliveryRangeMiles).toBe('10');
    expect(updatedDbUser?.location).not.toBeNull();
  });

  it('PUT /api/users/me should return 404 if the user does not exist in DB', async () => {
    const res = await authedRequest(
      '/api/users/me',
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Ghost User',
          address: 'Nowhere',
          city: 'Townville',
          lat: 0,
          lng: 0,
          deliveryRangeMiles: 5,
        }),
      },
      { id: 'non_existent_id' },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'User not found');
  });

  it('PUT /api/users/me/schedule-rules should save to DB and return 200', async () => {
    await testDb.insert(users).values({ id: TEST_USER_ID, email: 'scheduler@example.com' });

    const payload = {
      pickupWindows: [{ day: 'Monday', start: '09:00', end: '17:00' }],
      deliveryWindows: [{ day: 'Wednesday', start: '10:00', end: '14:00' }],
    };

    const res = await authedRequest(
      '/api/users/me/schedule-rules',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const dbRules = await testDb
      .select()
      .from(scheduleRules)
      .where(eq(scheduleRules.sellerId, TEST_USER_ID));

    expect(dbRules).toHaveLength(2);
    expect(
      dbRules.some(
        (r: { dayOfWeek: string; startTime: string; type: string }) =>
          r.dayOfWeek === 'Monday' && r.startTime === '09:00:00' && r.type === 'pickup',
      ),
    ).toBe(true);
    expect(
      dbRules.some(
        (r: { dayOfWeek: string; startTime: string; type: string }) =>
          r.dayOfWeek === 'Wednesday' && r.startTime === '10:00:00' && r.type === 'delivery',
      ),
    ).toBe(true);
  });

  it('PUT /api/users/me/schedule-rules should return 400 Bad Request for invalid payload', async () => {
    await testDb.insert(users).values({ id: TEST_USER_ID, email: 'badreq@example.com' });

    const res = await authedRequest(
      '/api/users/me/schedule-rules',
      {
        method: 'PUT',
        body: JSON.stringify({
          pickupWindows: [{ day: 'Monday' /* missing start/end */ }],
          deliveryWindows: [],
        }),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
  });

  it('PUT /api/users/me/schedule-rules should return 404 if user not in DB', async () => {
    const res = await authedRequest(
      '/api/users/me/schedule-rules',
      {
        method: 'PUT',
        body: JSON.stringify({
          pickupWindows: [],
          deliveryWindows: [],
        }),
      },
      { id: 'non_existent_user' },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'User not found');
  });

  it('POST /api/users/fcm-token should store token in the fcm_tokens table and return 200', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      email: 'fcm@example.com',
      name: 'FCM User',
    });

    const payload = {
      token: 'v1-firebase-token-12345',
      platform: 'android',
    };

    const res = await authedRequest(
      '/api/users/fcm-token',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });

    const insertedTokens = await testDb
      .select()
      .from(fcmTokens)
      .where(eq(fcmTokens.userId, TEST_USER_ID));

    expect(insertedTokens).toHaveLength(1);
    expect(insertedTokens[0].token).toBe(payload.token);
    expect(insertedTokens[0].platform).toBe(payload.platform);
  });

  it('POST /api/users/fcm-token should return 404 if user is not in database', async () => {
    const res = await authedRequest(
      '/api/users/fcm-token',
      {
        method: 'POST',
        body: JSON.stringify({ token: 't', platform: 'p' }),
      },
      { id: 'non_existent_id' },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'User not found');
  });

  it('POST /api/users/fcm-token should return 400 for invalid request body', async () => {
    await testDb.insert(users).values({ id: TEST_USER_ID, email: 'valid@example.com' });

    const res = await authedRequest(
      '/api/users/fcm-token',
      {
        method: 'POST',
        body: JSON.stringify({ token: 'missing-platform' }),
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
  });

  describe('GET /api/users/:id/reviews', () => {
    const BUYER_ID = 'review_buyer';
    const SELLER_ID = 'review_seller';

    beforeEach(async () => {
      await testDb.insert(users).values([
        { id: BUYER_ID, name: 'Reviewer', email: 'reviewer@example.com' },
        { id: SELLER_ID, name: 'Shop Owner', email: 'shopowner@example.com' },
      ]);

      const ORDER_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const ORDER_2 = '11111111-2222-3333-4444-555555555555';

      await testDb.insert(orders).values([
        {
          id: ORDER_1,
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
        },
        {
          id: ORDER_2,
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '20',
        },
      ]);

      await testDb.insert(reviews).values([
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          orderId: ORDER_1,
          rating: 5,
          comment: 'Awesome',
          createdAt: new Date('2024-01-01'),
        },
        {
          buyerId: BUYER_ID,
          sellerId: SELLER_ID,
          orderId: ORDER_2,
          rating: 2,
          comment: 'Not great',
          createdAt: new Date('2024-01-02'),
        },
      ]);
    });

    it('should fetch paginated reviews successfully', async () => {
      const res = await authedRequest(
        `/api/users/${SELLER_ID}/reviews?page=1&limit=1&sortBy=createdAt&sortOrder=desc`,
        {},
        { id: BUYER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body).toHaveProperty('pagination');
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(1);
      expect(body.pagination.totalPages).toBe(2);

      expect(body).toHaveProperty('reviews');
      expect(body.reviews).toHaveLength(1);
      // Because we requested desc createdAt, the newest review (rating 2) should be first
      expect(body.reviews[0].rating).toBe(2);
      expect(body.reviews[0].comment).toBe('Not great');
      expect(body.reviews[0].buyer).toHaveProperty('name', 'Reviewer');
    });

    it('should validate query parameters (e.g., max limit)', async () => {
      const res = await authedRequest(`/api/users/${SELLER_ID}/reviews?limit=100`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/:id (Public Profile)', () => {
    const SELLER_ID = 'public_seller_123';
    const BUYER_1_ID = 'public_buyer_1';
    const BUYER_2_ID = 'public_buyer_2';

    beforeEach(async () => {
      await testDb.insert(users).values([
        {
          id: SELLER_ID,
          name: 'Farmer John',
          email: 'john@example.com',
          passwordHash: 'super_secret',
          aboutMe: 'Farm life',
          specialties: ['corn', 'beans'],
          city: 'Omaha',
          createdAt: new Date('2023-01-01'),
        },
        { id: BUYER_1_ID, name: 'Buyer 1', email: 'b1@example.com' },
        { id: BUYER_2_ID, name: 'Buyer 2', email: 'b2@example.com' },
      ]);

      const orderId1 = '11111111-1111-1111-1111-111111111111';
      const orderId2 = '22222222-2222-2222-2222-222222222222';

      await testDb.insert(orders).values([
        {
          id: orderId1,
          buyerId: BUYER_1_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '10',
          createdAt: new Date(), // This month
        },
        {
          id: orderId2,
          buyerId: BUYER_2_ID,
          sellerId: SELLER_ID,
          paymentMethod: 'card',
          fulfillmentType: 'pickup',
          scheduledTime: new Date(),
          totalAmount: '15',
          createdAt: new Date(), // This month
        },
      ]);

      await testDb.insert(reviews).values([
        {
          buyerId: BUYER_1_ID,
          sellerId: SELLER_ID,
          orderId: orderId1,
          rating: 5,
          comment: 'Great!',
        },
        { buyerId: BUYER_2_ID, sellerId: SELLER_ID, orderId: orderId2, rating: 4, comment: 'Good' },
      ]);
    });

    it('should return public profile with stats and exclude sensitive info', async () => {
      const res = await request(`/api/users/${SELLER_ID}`);

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.id).toBe(SELLER_ID);
      expect(body.name).toBe('Farmer John');
      expect(body.city).toBe('Omaha');
      expect(body.aboutMe).toBe('Farm life');
      expect(body.specialties).toEqual(['corn', 'beans']);
      expect(body.joinedAt).toBeDefined();

      expect(body).not.toHaveProperty('passwordHash');
      expect(body).not.toHaveProperty('email');

      expect(body.totalReviews).toBe(2);
      expect(body.starRating).toBe(4.5); // (5 + 4) / 2
      expect(body.reviewBreakdown).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 });
      expect(body.activeBuyerCount).toBe(2);
    });

    it('should return 404 for missing user', async () => {
      const res = await request('/api/users/not-found');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('User not found');
    });
  });
});
