import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Users API', () => {
  it('GET /api/users/me should return 200', async () => {
    const res = await authedRequest('/api/users/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
  });

  it('PUT /api/users/me should return 200', async () => {
    const res = await authedRequest('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'John Doe',
        address: '123 Main St',
        lat: 45.0,
        lng: -90.0,
        deliveryRangeMiles: 10,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('POST /api/users/fcm-token should return 200', async () => {
    const res = await authedRequest('/api/users/fcm-token', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test_token_abc',
        platform: 'ios',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('PUT /api/users/me/schedule-rules should return 200', async () => {
    const res = await authedRequest('/api/users/me/schedule-rules', {
      method: 'PUT',
      body: JSON.stringify({
        pickupWindows: [{ day: 'Monday', start: '09:00', end: '17:00' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
