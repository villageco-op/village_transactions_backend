import { describe, it, expect } from 'vitest';

import { request } from '../../test-utils/request.js';

import { isTestingEnvironment } from '../../../src/utils.js';

describe.skipIf(!isTestingEnvironment)('Testing API - Smoke Tests', { timeout: 60_000 }, () => {
  it('GET /api/testing should not return a 500 error', async () => {
    const res = await request('/api/testing?email=test@example.com');

    expect(res.status).not.toBe(500);
  });

  it('POST /api/testing/seed-user should not return a 500 error', async () => {
    const res = await request('/api/testing/seed-user', {
      method: 'POST',
      body: JSON.stringify({
        email: `smoke-${Date.now()}@example.com`,
        name: 'Smoke Test User',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/testing/test-login should not return a 500 error', async () => {
    const res = await request('/api/testing/test-login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/testing/seed-produce should not return a 500 error', async () => {
    const res = await request('/api/testing/seed-produce', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        produce: {},
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
