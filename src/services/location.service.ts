import { HTTPException } from 'hono/http-exception';

import type { AppLogger } from '../interfaces/logger.interface.js';
import type { GeocodePayload } from '../schemas/location.schema.js';

/**
 * Contacts Mapbox API to translate raw address strings into latitude and longitude coordinates.
 * @param data Individual pieces of the address setup
 * @param log Runtime application logger
 * @returns The latitude and longitude
 */
export async function processGeocoding(
  data: GeocodePayload,
  log: AppLogger,
): Promise<{ lat: number; lng: number }> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    log.error('MAPBOX_ACCESS_TOKEN is missing from the environment variables');
    throw new HTTPException(500, { message: 'Geocoding service misconfigured' });
  }

  const queryAddress = `${data.address}, ${data.city}, ${data.state} ${data.zip}, United States`;

  const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    queryAddress,
  )}.json?access_token=${mapboxToken}&limit=1`;

  try {
    const response = await fetch(mapboxUrl);

    if (!response.ok) {
      log.error({ status: response.status }, 'Mapbox API request returned an upstream error');
      throw new HTTPException(502, { message: 'Failed to communicate with location provider' });
    }

    const body = (await response.json()) as { features?: Array<{ center: [number, number] }> };

    if (!body.features || body.features.length === 0) {
      log.warn({ queryAddress }, 'Mapbox was unable to find matching coordinates for address');
      throw new HTTPException(400, {
        message: 'Could not resolve address location. Please verify details.',
      });
    }

    const [lng, lat] = body.features[0].center;

    return { lat, lng };
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    log.error({ error }, 'Unexpected error encountered while processing Mapbox transaction');
    throw new HTTPException(500, { message: 'An internal error occurred during geocoding' });
  }
}
