import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { processGeocoding } from '../../../src/services/location.service.js';
import type { AppLogger } from '../../../src/interfaces/logger.interface.js';
import type { GeocodePayload } from '../../../src/schemas/location.schema.js';

describe('LocationService - processGeocoding', () => {
  let mockLogger: AppLogger;
  let samplePayload: GeocodePayload;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    process.env = { ...originalEnv };
    process.env.MAPBOX_ACCESS_TOKEN = 'mock-mapbox-token';

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as AppLogger;

    samplePayload = {
      address: '1600 Amphitheatre Pkwy',
      city: 'Mountain View',
      state: 'CA',
      zip: '94043',
    };

    global.fetch = vi.fn();
  });

  it('should successfully return latitude and longitude when Mapbox responds with data', async () => {
    const mockMapboxResponse = {
      features: [
        {
          center: [-122.084058, 37.422021],
        },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockMapboxResponse),
    } as unknown as Response);

    const result = await processGeocoding(samplePayload, mockLogger);

    expect(result).toEqual({ lat: 37.422021, lng: -122.084058 });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Assert URI encoding and token formatting
    const expectedAddress = encodeURIComponent(
      '1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States',
    );
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${expectedAddress}.json?access_token=mock-mapbox-token&limit=1`,
    );
  });

  it('should throw a 500 HTTPException if MAPBOX_ACCESS_TOKEN is missing', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    await expect(processGeocoding(samplePayload, mockLogger)).rejects.toThrow(HTTPException);

    try {
      await processGeocoding(samplePayload, mockLogger);
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.message).toBe('Geocoding service misconfigured');
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      'MAPBOX_ACCESS_TOKEN is missing from the environment variables',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should throw a 502 HTTPException when Mapbox API returns a non-ok status', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response);

    await expect(processGeocoding(samplePayload, mockLogger)).rejects.toThrow(HTTPException);

    try {
      await processGeocoding(samplePayload, mockLogger);
    } catch (error: any) {
      expect(error.status).toBe(502);
      expect(error.message).toBe('Failed to communicate with location provider');
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      { status: 401 },
      'Mapbox API request returned an upstream error',
    );
  });

  it('should throw a 400 HTTPException if Mapbox returns empty features array', async () => {
    const mockEmptyResponse = { features: [] };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockEmptyResponse),
    } as unknown as Response);

    await expect(processGeocoding(samplePayload, mockLogger)).rejects.toThrow(HTTPException);

    try {
      await processGeocoding(samplePayload, mockLogger);
    } catch (error: any) {
      expect(error.status).toBe(400);
      expect(error.message).toBe('Could not resolve address location. Please verify details.');
    }

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { queryAddress: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States' },
      'Mapbox was unable to find matching coordinates for address',
    );
  });

  it('should log and throw a 500 HTTPException on unexpected code exceptions (e.g., network failure)', async () => {
    const networkError = new Error('Network failure');
    vi.mocked(global.fetch).mockRejectedValueOnce(networkError);

    await expect(processGeocoding(samplePayload, mockLogger)).rejects.toThrow(HTTPException);

    try {
      await processGeocoding(samplePayload, mockLogger);
    } catch (error: any) {
      expect(error.status).toBe(500);
      expect(error.message).toBe('An internal error occurred during geocoding');
    }

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: networkError },
      'Unexpected error encountered while processing Mapbox transaction',
    );
  });
});
