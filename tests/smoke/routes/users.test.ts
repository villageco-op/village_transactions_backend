import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Users API - Smoke Tests', () => {
  it('GET /api/users/me should not return a 500 error', async () => {
    const res = await authedRequest('/api/users/me');

    expect(res.status).not.toBe(500);
  });

  it('PUT /api/users/me should not return a 500 error', async () => {
    const res = await authedRequest('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'John Doe',
        address: '123 Main St',
        city: 'Memphis',
        lat: 45.0,
        lng: -90.0,
        deliveryRangeMiles: 10,
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/users/fcm-token should not return a 500 error', async () => {
    const res = await authedRequest('/api/users/fcm-token', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test_token_abc',
        platform: 'ios',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('PUT /api/users/me/schedule-rules should not return a 500 error', async () => {
    const res = await authedRequest('/api/users/me/schedule-rules', {
      method: 'PUT',
      body: JSON.stringify({
        pickupWindows: [{ day: 'Monday', start: '09:00', end: '17:00' }],
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/users/:id/reviews should not return a 500 error', async () => {
    const res = await authedRequest('/api/users/any_seller_id/reviews?page=1&limit=5');
    expect(res.status).not.toBe(500);
  });
});
