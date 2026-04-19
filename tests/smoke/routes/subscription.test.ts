import { describe, it, expect } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';

describe('Subscriptions API - Smoke Tests', () => {
  it('PUT /api/subscriptions/:id/status should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await authedRequest(`/api/subscriptions/${mockId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'paused' }),
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/subscriptions/:id should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await authedRequest(`/api/subscriptions/${mockId}`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/subscriptions should not return a 500 error', async () => {
    const res = await authedRequest(`/api/subscriptions?page=1&limit=10`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
