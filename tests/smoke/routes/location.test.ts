import { describe, it, expect } from 'vitest';

import { request } from '../../test-utils/request.js';

describe('Location API - Smoke Tests', { timeout: 60_000 }, () => {
  it('POST /api/location/geocode should run end-to-end and not return a 500 error', async () => {
    const res = await request('/api/location/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: '1600 Amphitheatre Pkwy',
        city: 'Mountain View',
        state: 'CA',
        zip: '94043',
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
