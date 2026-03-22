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
});
