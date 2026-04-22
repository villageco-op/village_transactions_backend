import { describe, it, expect } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';

describe('Growers API - Smoke Tests', () => {
  it('GET /api/growers/growers-map should not return a 500 error', async () => {
    const res = await authedRequest(`/api/growers/growers-map`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
