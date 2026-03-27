import { describe, it, expect } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';

describe('Buyer API - Smoke Tests', () => {
  it('GET /api/buyer/growers should not return a 500 error', async () => {
    const res = await authedRequest(`/api/buyer/growers?limit=10&offset=0`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
