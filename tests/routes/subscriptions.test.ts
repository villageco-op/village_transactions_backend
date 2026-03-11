import { describe, it, expect } from 'vitest';
import { request } from '../test-utils';

describe('Subscriptions API', () => {
  it('PUT /api/subscriptions/:id/status should return 200', async () => {
    const res = await request('/api/subscriptions/sub_123/status', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'paused',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
