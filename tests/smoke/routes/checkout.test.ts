import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Checkout API - Smoke Tests', () => {
  it('POST /api/checkout/stripe/session should not return a 500 error', async () => {
    const payload = {
      sellerId: 'some-seller-id',
      fulfillmentType: 'pickup',
      scheduledTime: new Date().toISOString(),
    };

    const res = await authedRequest('/api/checkout/stripe/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(res.status).not.toBe(500);
  });
});
