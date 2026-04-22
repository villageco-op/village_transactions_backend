import { describe, it, expect } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';

describe('Buyer API - Smoke Tests', () => {
  it('GET /api/buyer/growers should not return a 500 error', async () => {
    const res = await authedRequest(`/api/buyer/growers?limit=10&offset=0`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/buyer/billing-summary should not return a 500 error', async () => {
    const mockId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await authedRequest(`/api/buyer/${mockId}/billing-summary`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/buyer/dashboard should not return a 500 error', async () => {
    const mockId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await authedRequest(`/api/buyer/${mockId}/dashboard`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
