import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Reviews API - Smoke Tests', () => {
  it('POST /api/reviews should not return a 500 error', async () => {
    const res = await authedRequest('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        sellerId: 'some_seller_id',
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        rating: 5,
        comment: 'Delicious!',
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
