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
});
