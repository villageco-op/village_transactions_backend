import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processStripeWebhookEvent } from '../../../src/services/stripe.service.js';
import { request } from '../../test-utils/request.js';

vi.mock('../../../src/services/stripe.service.js', () => ({
  processStripeWebhookEvent: vi.fn(),
}));

vi.mock('stripe', () => {
  class MockStripe {
    webhooks = {
      constructEvent: (body: string, sig: string) => {
        if (sig === 'invalid') throw new Error('Verification failed');
        return { type: 'checkout.session.completed', data: { object: {} } };
      },
    };
  }
  return {
    default: MockStripe,
  };
});

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  it('POST /api/stripe/webhook should return 400 if signature is missing', async () => {
    const res = await request('/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'dummy' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Missing stripe signature or secret');
  });

  it('POST /api/stripe/webhook should return 400 if signature is invalid', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const res = await request('/api/stripe/webhook', {
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

  it('POST /api/stripe/webhook should return 200 and process event on valid signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

    const res = await request('/api/stripe/webhook', {
      method: 'POST',
      body: 'valid_raw_payload',
      headers: {
        'stripe-signature': 'valid_signature',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('received', true);
    expect(processStripeWebhookEvent).toHaveBeenCalled();
  });
});
