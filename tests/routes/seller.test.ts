import { describe, it, expect } from 'vitest';
import { request } from '../test-utils';

describe('Seller API', () => {
  it('GET /api/seller/customers should return 200', async () => {
    const res = await request('/api/seller/customers');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/seller/analytics should return 200', async () => {
    const res = await request('/api/seller/analytics?timeframe=30d');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  });
});
