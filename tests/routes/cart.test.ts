import { describe, it, expect } from 'vitest';
import { request } from '../test-utils';

describe('Cart API', () => {
  it('GET /api/cart should return 200', async () => {
    const res = await request('/api/cart');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('POST /api/cart/add should return 200', async () => {
    const res = await request('/api/cart/add', {
      method: 'POST',
      body: JSON.stringify({
        productId: 'prod_123',
        quantityOz: 16,
        isSubscription: false,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('DELETE /api/cart/remove/:reservationId should return 200', async () => {
    const res = await request('/api/cart/remove/res_123', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
