import { describe, it, expect } from 'vitest';

import { app } from '../src/index';

describe('API Smoke Tests', () => {
  it('GET /health should return 200', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/json/);

    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
