import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Checkout API', () => {
  it('POST /api/checkout/stripe/session should return 200', async () => {
    const res = await request('/api/checkout/stripe/session', {
      method: 'POST',
      body: JSON.stringify({
        sellerId: 'seller_123',
        fulfillmentType: 'pickup',
        scheduledTime: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('url');
  });

  it('POST /api/checkout/snap/initiate should return 200', async () => {
    const res = await request('/api/checkout/snap/initiate', {
      method: 'POST',
      body: JSON.stringify({
        sellerId: 'seller_123',
        fulfillmentType: 'pickup',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
