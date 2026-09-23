import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processStripeWebhookEvent } from '../../../src/services/stripe.service.js';
import { request } from '../../test-utils/request.js';

vi.mock('../../../src/services/stripe.service.js', () => ({
  processStripeWebhookEvent: vi.fn(),
}));

vi.mock('stripe', () => {
  class MockStripe {
    webhooks = {
      constructEvent: (_body: string, sig: string, _secret: string) => {
        if (sig === 'invalid') throw new Error('Verification failed');
        return { type: 'checkout.session.completed', data: { object: {} } };
      },
    };
  }
  return {
    default: MockStripe,
  };
});

describe('Stripe Webhook Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET_ACCOUNT = 'whsec_account_test';
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT = 'whsec_connect_test';
  });

  const endpoints = [
    {
      path: '/api/stripe/webhook/account',
      secretEnvKey: 'STRIPE_WEBHOOK_SECRET_ACCOUNT',
      label: 'Your Account',
    },
    {
      path: '/api/stripe/webhook/connect',
      secretEnvKey: 'STRIPE_WEBHOOK_SECRET_CONNECT',
      label: 'Connected Accounts',
    },
  ];

  describe.each(endpoints)('$label ($path)', ({ path, secretEnvKey }) => {
    it('should return 400 if signature header is missing', async () => {
      const res = await request(path, {
        method: 'POST',
        body: JSON.stringify({ type: 'dummy' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Missing stripe signature or secret');
    });

    it('should return 400 if webhook secret env var is missing', async () => {
      delete process.env[secretEnvKey];

      const res = await request(path, {
        method: 'POST',
        body: 'raw_payload',
        headers: {
          'stripe-signature': 'valid_signature',
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Missing stripe signature or secret');
    });

    it('should return 400 if signature verification fails', async () => {
      const res = await request(path, {
        method: 'POST',
        body: 'raw_payload',
        headers: {
          'stripe-signature': 'invalid',
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Webhook signature verification failed');
    });

    it('should return 200 and process event on valid signature', async () => {
      const res = await request(path, {
        method: 'POST',
        body: 'valid_raw_payload',
        headers: {
          'stripe-signature': 'valid_signature',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('received', true);
      expect(processStripeWebhookEvent).toHaveBeenCalledTimes(1);
    });
  });
});
