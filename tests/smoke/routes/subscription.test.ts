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
});
