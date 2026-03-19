import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Cart API - Smoke Tests', () => {
  it('POST /api/cart/add should not return a 500 error', async () => {
    const res = await authedRequest('/api/cart/add', {
      method: 'POST',
      body: JSON.stringify({
        productId: '123e4567-e89b-12d3-a456-426614174000',
        quantityOz: 5,
        isSubscription: false,
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/cart should not return a 500 error', async () => {
    const res = await authedRequest('/api/cart', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('DELETE /api/cart/remove/:reservationId should not return a 500 error', async () => {
    const res = await authedRequest('/api/cart/remove/123e4567-e89b-12d3-a456-426614174000', {
      method: 'DELETE',
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/cron/release-carts should return 200 with valid CRON_SECRET token', async () => {
    const secret = process.env.CRON_SECRET || 'fallback-secret-if-none';
    process.env.CRON_SECRET = secret;

    const res = await authedRequest(
      '/api/cron/release-carts',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
        },
      },
      { id: '' },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe('number');
  });
});
