import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from '../../test-utils/request.js';

const delayResponse = (responseBody: any, statusCode = 200, ms = 50) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        json: async () => responseBody,
      });
    }, ms);
  });
};

describe('Location API Integration', () => {
  const originalEnv = process.env.MAPBOX_ACCESS_TOKEN;

  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = 'mock-token';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = originalEnv;
  });

  it('POST /api/location/geocode should return 200 with coordinates on valid request payload', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() =>
        delayResponse({ features: [{ center: [-122.084058, 37.422021] }] }, 200, 50),
      );
    vi.stubGlobal('fetch', mockFetch);

    const res = await request('/api/location/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '1600 Amphitheatre Pkwy',
        city: 'Mountain View',
        state: 'CA',
        zip: '94043',
      }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      lat: 37.422021,
      lng: -122.084058,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api.mapbox.com/geocoding'));
  });

  it('POST /api/location/geocode should return 400 Zod validation error if required body payload fields are missing', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const res = await request('/api/location/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '1600 Amphitheatre Pkwy',
      }),
    });

    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POST /api/location/geocode should forward 400 bad request error responses when location can not be resolved', async () => {
    const mockFetch = vi.fn().mockImplementation(() => delayResponse({ features: [] }, 200, 50));
    vi.stubGlobal('fetch', mockFetch);

    const res = await request('/api/location/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: 'Fake Street 123456789',
        city: 'Nowhereville',
        state: 'ZZ',
        zip: '00000',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Could not resolve address location');
  });

  it('POST /api/location/geocode should forward 500 internal server responses when service is misconfigured', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = '';

    const res = await request('/api/location/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '1600 Amphitheatre Pkwy',
        city: 'Mountain View',
        state: 'CA',
        zip: '94043',
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Geocoding service misconfigured');
  });
});
