import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users, fcmTokens } from '../../../src/db/schema.js';

describe('Users API Integration', { timeout: 60_000 }, () => {
  let testDb: any;

  const TEST_USER_ID = 'test_auth_user_123';

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
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
      address: '101 Api Blvd',
      stripeAccountId: 'acct_api_123',
    });

    const res = await authedRequest('/api/users/me', {}, { id: TEST_USER_ID });

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body).toHaveProperty('id', TEST_USER_ID);
    expect(body).toHaveProperty('name', 'Jane Api User');
    expect(body).toHaveProperty('email', 'jane.api@example.com');
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
          address: '123 Main St',
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

  it('PUT /api/users/me/schedule-rules should return 200', async () => {
    const res = await authedRequest('/api/users/me/schedule-rules', {
      method: 'PUT',
      body: JSON.stringify({
        pickupWindows: [{ day: 'Monday', start: '09:00', end: '17:00' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
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
});
