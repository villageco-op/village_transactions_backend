import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, Mocked } from 'vitest';
import Stripe from 'stripe';

import { authedRequest } from '../../test-utils/auth.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users } from '../../../src/db/schema.js';
import { __setStripeClient } from '../../../src/services/stripe.service.js';

const mockStripe = {
  accounts: {
    create: vi.fn().mockResolvedValue({ id: 'acct_integration_mock_123' }),
  },
  accountLinks: {
    create: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/integration-mock-url' }),
  },
} as unknown as Mocked<Stripe>;

describe('Stripe API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'stripe_integration_user_123';

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
    __setStripeClient(mockStripe);
  });

  it('POST /api/stripe/connect/onboard should return 401 if unauthorized', async () => {
    const res = await authedRequest('/api/stripe/connect/onboard', { method: 'POST' }, { id: '' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Unauthorized');
  });

  it('POST /api/stripe/connect/onboard should create stripe account, save to DB, and return 200 with URL', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      email: 'stripe.onboard.api@example.com',
      name: 'Onboard User',
    });

    const res = await authedRequest(
      '/api/stripe/connect/onboard',
      { method: 'POST' },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('url', 'https://connect.stripe.com/integration-mock-url');

    const updatedDbUser = await userRepository.findById(TEST_USER_ID);
    expect(updatedDbUser?.stripeAccountId).toBe('acct_integration_mock_123');
  });

  it('POST /api/stripe/connect/onboard should NOT overwrite existing stripeAccountId', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      email: 'stripe.existing@example.com',
      name: 'Existing Account User',
      stripeAccountId: 'acct_pre_existing_777',
    });

    const res = await authedRequest(
      '/api/stripe/connect/onboard',
      { method: 'POST' },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);

    const updatedDbUser = await userRepository.findById(TEST_USER_ID);
    expect(updatedDbUser?.stripeAccountId).toBe('acct_pre_existing_777');
  });

  describe('GET /api/stripe/connect/status Integration', () => {
    const TEST_USER_ID = 'stripe_status_user_123';

    beforeEach(async () => {
      await truncateTables(testDb);

      mockStripe.accounts.retrieve = vi.fn().mockResolvedValue({
        id: 'acct_integration_123',
        details_submitted: true,
        charges_enabled: true,
      });

      __setStripeClient(mockStripe);
    });

    it('GET /api/stripe/connect/status should return 401 if unauthorized', async () => {
      const res = await authedRequest('/api/stripe/connect/status', { method: 'GET' }, { id: '' });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Unauthorized');
    });

    it('GET /api/stripe/connect/status should return isComplete: false if user or stripeAccountId is missing', async () => {
      await testDb.insert(users).values({
        id: TEST_USER_ID,
        email: 'no.stripe@example.com',
        name: 'No Stripe User',
        stripeAccountId: null,
        stripeOnboardingComplete: false,
      });

      const res = await authedRequest(
        '/api/stripe/connect/status',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ isComplete: false });
    });

    it('GET /api/stripe/connect/status should return isComplete: true from local DB status', async () => {
      await testDb.insert(users).values({
        id: TEST_USER_ID,
        email: 'completed@example.com',
        name: 'Completed User',
        stripeAccountId: 'acct_already_done',
        stripeOnboardingComplete: true,
      });

      const res = await authedRequest(
        '/api/stripe/connect/status',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ isComplete: true });
      expect(mockStripe.accounts.retrieve).not.toHaveBeenCalled();
    });

    it('GET /api/stripe/connect/status should check Stripe, update DB, and return true when complete on Stripe', async () => {
      await testDb.insert(users).values({
        id: TEST_USER_ID,
        email: 'pending@example.com',
        name: 'Pending User',
        stripeAccountId: 'acct_integration_123',
        stripeOnboardingComplete: false,
      });

      const res = await authedRequest(
        '/api/stripe/connect/status',
        { method: 'GET' },
        { id: TEST_USER_ID },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ isComplete: true });

      const updatedUser = await userRepository.findById(TEST_USER_ID);
      expect(updatedUser?.stripeOnboardingComplete).toBe(true);
    });
  });
});
