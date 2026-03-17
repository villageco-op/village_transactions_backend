import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Stripe API', () => {
  it('POST /api/stripe/webhook should return 200', async () => {
    const res = await request('/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({
        type: 'payment_intent.succeeded',
        data: { id: 'evt_123' },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('POST /api/stripe/connect/onboard should return 200', async () => {
    const res = await request('/api/stripe/connect/onboard', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('url');
  });
});
