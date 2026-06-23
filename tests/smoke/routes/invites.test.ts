import { describe, it, expect } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import { request } from '../../test-utils/request.js';

describe('Invites API - Smoke Tests', { timeout: 60_000 }, () => {
  const dummyEmail = 'smoke-test-colleague@example.com';
  const dummyCode = 'smoke-test-code-12345';
  const dummyOrgId = 'org_smoke_12345';

  it('POST /api/invites/invite should not return a 500 error', async () => {
    const res = await authedRequest('/api/invites/invite', {
      method: 'POST',
      body: JSON.stringify({
        email: dummyEmail,
        role: 'member',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('POST /api/invites/accept should not return a 500 error', async () => {
    const res = await request('/api/invites/accept', {
      method: 'POST',
      body: JSON.stringify({
        email: dummyEmail,
        code: dummyCode,
        orgId: dummyOrgId,
      }),
    });

    expect(res.status).not.toBe(500);
  });
});
