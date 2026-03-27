import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Cron API', () => {
  it('POST /api/cron/release-carts should return 200 with correct auth', async () => {
    const res = await request('/api/cron/release-carts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_cron_secret',
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
