import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import { GeocodeRequestSchema, GeocodeResponseSchema } from '../schemas/location.schema.js';
import { processGeocoding } from '../services/location.service.js';

export const locationRoute = new OpenAPIHono<RouteEnv>();

locationRoute.openapi(
  createRoute({
    method: 'post',
    path: '/geocode',
    operationId: 'geocodeAddress',
    description: 'Resolves raw address field parameters to geographic coordinates via Mapbox.',
    tags: [TAGS.LOCATION],
    request: {
      body: {
        content: {
          'application/json': { schema: GeocodeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Successfully geocoded address to lat/lng point coordinates',
        content: { 'application/json': { schema: GeocodeResponseSchema } },
      },
      400: {
        description: 'Invalid input parameters or unresolvable location parameters',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      500: {
        description: 'Internal server initialization error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');

    const log = c.get('logger').child({
      action: 'geocodeAddress',
      zip: body.zip,
    });

    const coordinates = await processGeocoding(body, log);

    log.info('Address properties successfully resolved into coordinates');
    return c.json(coordinates, 200);
  },
);
