import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';

import {
  __setStripeClient,
  generateStripeOnboardLink,
} from '../../../src/services/stripe.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { updateInternalStripeAccountId } from '../../../src/services/user.service.js';

const mockStripe = {
  accounts: {
    create: vi.fn().mockResolvedValue({ id: 'acct_test' }),
  },
  accountLinks: {
    create: vi.fn().mockResolvedValue({ url: 'test_url' }),
  },
} as unknown as Mocked<Stripe>;

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/services/user.service.js', () => ({
  updateInternalStripeAccountId: vi.fn(),
}));

describe('StripeService - generateStripeOnboardLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    __setStripeClient(mockStripe);
  });

  it('should throw a 404 if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(generateStripeOnboardLink('missing_user')).rejects.toThrow(HTTPException);
  });

  it('should create a Stripe account and link if user does NOT have a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_1',
      stripeAccountId: null,
    } as any);

    vi.mocked(mockStripe.accounts.create).mockResolvedValueOnce({
      id: 'acct_new123',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_1');

    expect(mockStripe.accounts.create).toHaveBeenCalledWith({
      type: 'express',
      country: 'US',
      capabilities: { transfers: { requested: true } },
    });

    expect(updateInternalStripeAccountId).toHaveBeenCalledWith('user_1', 'acct_new123');

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_new123',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/onboard');
  });

  it('should skip creating a Stripe account and ONLY generate link if user ALREADY has a stripeAccountId', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce({
      id: 'user_2',
      stripeAccountId: 'acct_existing999',
    } as any);

    vi.mocked(mockStripe.accountLinks.create).mockResolvedValueOnce({
      url: 'https://connect.stripe.com/resume-onboard',
    } as any);

    const url = await generateStripeOnboardLink('user_2');

    expect(mockStripe.accounts.create).not.toHaveBeenCalled();
    expect(updateInternalStripeAccountId).not.toHaveBeenCalled();

    expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
      account: 'acct_existing999',
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/dashboard',
      type: 'account_onboarding',
    });

    expect(url).toBe('https://connect.stripe.com/resume-onboard');
  });
});
