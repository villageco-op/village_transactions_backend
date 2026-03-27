import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Produce API', () => {
  it('GET /api/produce/map should return 200', async () => {
    const res = await request('/api/produce/map?lat=45.0&lng=-90.0&radiusMiles=10');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/produce/list should return 200', async () => {
    const res = await request('/api/produce/list?lat=45.0&lng=-90.0&limit=10');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/produce should return 201', async () => {
    const res = await request('/api/produce', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Heirloom Tomatoes',
        pricePerOz: 0.5,
        totalOzInventory: 100,
        harvestFrequencyDays: 7,
        seasonStart: '2023-06-01',
        seasonEnd: '2023-09-01',
        images: ['img1.jpg'],
        isSubscribable: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
  });

  it('PUT /api/produce/:id should return 200', async () => {
    const res = await request('/api/produce/prod_123', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'active',
        totalOzInventory: 200,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('DELETE /api/produce/:id should return 200', async () => {
    const res = await request('/api/produce/prod_123', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
