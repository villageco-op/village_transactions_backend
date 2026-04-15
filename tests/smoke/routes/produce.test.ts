import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Produce API - Smoke Tests', () => {
  it('POST /api/produce should not return a 500 error', async () => {
    const res = await authedRequest('/api/produce', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Organic Honeycrisp Apples',
        produceType: 'fruit',
        pricePerOz: 0.25,
        totalOzInventory: 500,
        harvestFrequencyDays: 7,
        seasonStart: '2024-09-01',
        seasonEnd: '2024-11-30',
        images: ['https://example.com/apple.jpg'],
        isSubscribable: true,
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('PUT /api/produce/:id should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';

    const res = await authedRequest(`/api/produce/${mockId}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'paused',
        totalOzInventory: 400,
      }),
    });

    expect(res.status).not.toBe(500);
  });

  it('DELETE /api/produce/:id should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await authedRequest(`/api/produce/${mockId}`, {
      method: 'DELETE',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/produce/list should not return a 500 error', async () => {
    const res = await authedRequest('/api/produce/list?lat=40.7128&lng=-74.0060', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/produce/map should not return a 500 error', async () => {
    const res = await authedRequest('/api/produce/map?lat=40.7128&lng=-74.0060&radiusMiles=50', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/produce/:id/orders should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';
    const res = await authedRequest(`/api/produce/${mockId}/orders?limit=10&offset=0`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/produce/me should not return a 500 error', async () => {
    const res = await authedRequest('/api/produce/me?limit=10&offset=0&status=active', {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });

  it('GET /api/produce/:id should not return a 500 error', async () => {
    const mockId = '123e4567-e89b-12d3-a456-426614174000';

    const res = await authedRequest(`/api/produce/${mockId}`, {
      method: 'GET',
    });

    expect(res.status).not.toBe(500);
  });
});
