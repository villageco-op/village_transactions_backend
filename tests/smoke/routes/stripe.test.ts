import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Stripe API - Smoke Tests', () => {
  it('POST /api/stripe/connect/onboard should not return a 500 error', async () => {
    const res = await authedRequest('/api/stripe/connect/onboard', {
      method: 'POST',
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/stripe/webhook should not return a 500 error', async () => {
    const res = await authedRequest('/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'dummy.event' }),
    });

    expect(res.status).not.toBe(500);
  });
});
