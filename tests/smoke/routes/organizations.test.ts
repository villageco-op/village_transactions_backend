import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Organizations API - Smoke Tests', { timeout: 60_000 }, () => {
  const dummyUuid = '00000000-0000-0000-0000-000000000000';

  it('GET /api/organizations/subdomain/check should not return a 500 error', async () => {
    const res = await authedRequest(
      '/api/organizations/subdomain/check?subdomain=smoke-test-pantry',
    );

    expect(res.status).not.toBe(500);
  });

  it('POST /api/organizations should not return a 500 error', async () => {
    const res = await authedRequest('/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Smoke Test Kitchen',
        type: 'restaurant',
        address: '123 Main St',
        city: 'Madison',
        state: 'WI',
        country: 'United States',
        zip: '53703',
        lat: 43.0731,
        lng: -89.4012,
        subdomain: 'smoke-test-kitchen',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('PUT /api/organizations/:id should not return a 500 error', async () => {
    const res = await authedRequest(`/api/organizations/${dummyUuid}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated Smoke Name',
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('DELETE /api/organizations/:id should not return a 500 error', async () => {
    const res = await authedRequest(`/api/organizations/${dummyUuid}`, {
      method: 'DELETE',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/organizations/:id should not return a 500 error', async () => {
    const res = await authedRequest(`/api/organizations/${dummyUuid}`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
