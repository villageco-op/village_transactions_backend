import { describe, it, expect } from 'vitest';
import { request } from '../test-utils/request.js';

describe('Health Check', () => {
  it('GET /health should return 200', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
