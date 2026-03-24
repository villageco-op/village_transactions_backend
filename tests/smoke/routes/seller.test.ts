import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Seller API - Smoke Tests', () => {
  it('GET /api/seller/customers should not return a 500 error', async () => {
    const res = await authedRequest('/api/seller/customers', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/seller/analytics should not return a 500 error with timeframe', async () => {
    const res = await authedRequest('/api/seller/analytics?timeframe=last_30_days', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/seller/payouts should not return a 500 error', async () => {
    const res = await authedRequest('/api/seller/payouts?timeframe=3months', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
