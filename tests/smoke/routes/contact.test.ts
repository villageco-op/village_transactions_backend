import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Contact API - Smoke Tests', () => {
  it('POST /api/contact should not return a 500 error', async () => {
    const res = await request('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Smoke Test User',
        message: 'This is a smoke test.',
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
