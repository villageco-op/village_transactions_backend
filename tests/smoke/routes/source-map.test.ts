import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Source Map API - Smoke Tests', () => {
  it('GET /api/source-map/nodes should not return a 500 error', async () => {
    const res = await authedRequest('/api/source-map/nodes', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/source-map/analytics should not return a 500 error', async () => {
    const res = await authedRequest('/api/source-map/analytics', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
