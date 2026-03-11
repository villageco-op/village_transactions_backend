import { describe, it, expect } from 'vitest';
import { request } from '../test-utils';

describe('Orders API', () => {
  it('GET /api/orders should return 200', async () => {
    const res = await request('/api/orders?role=buyer&status=active');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /api/orders/:id/schedule should return 200', async () => {
    const res = await request('/api/orders/order_123/schedule', {
      method: 'PUT',
      body: JSON.stringify({
        newTime: '2023-12-01T14:00:00Z',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('PUT /api/orders/:id/cancel should return 200', async () => {
    const res = await request('/api/orders/order_123/cancel', {
      method: 'PUT',
      body: JSON.stringify({
        reason: 'Changed my mind',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
