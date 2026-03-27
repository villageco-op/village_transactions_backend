import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Order API - Smoke Tests', () => {
  it('PUT /api/orders/:id/cancel should not return a 500 error', async () => {
    const mockId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await authedRequest(`/api/orders/${mockId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: 'Smoke test cancelation' }),
    });

    expect(res.status).not.toBe(500);
  });

  it('PUT /api/orders/:id/schedule should not return a 500 error', async () => {
    const mockId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await authedRequest(`/api/orders/${mockId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({ newTime: new Date().toISOString() }),
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/orders should not return a 500 error when role is provided', async () => {
    const res = await authedRequest('/api/orders?role=buyer', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
