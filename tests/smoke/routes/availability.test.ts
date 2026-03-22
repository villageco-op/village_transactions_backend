import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Availability API - Smoke Tests', () => {
  it('GET /api/availability/:sellerId should not return a 500 error', async () => {
    const sellerId = 'seller_99';
    const query = new URLSearchParams({
      type: 'delivery',
      date: '2026-03-22',
    }).toString();

    const res = await authedRequest(`/api/availability/${sellerId}?${query}`);

    expect(res.status).not.toBe(500);
  });
});
