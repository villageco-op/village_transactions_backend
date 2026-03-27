import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Availability API', () => {
  it('GET /api/availability/:sellerId should return 200', async () => {
    const res = await request('/api/availability/seller_123?type=pickup&date=2023-10-27');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
