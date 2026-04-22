import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import { MapGrowersQuerySchema, MapGrowersResponseSchema } from '../schemas/grower.schema.js';
import { getMapGrowers } from '../services/grower.service.js';

export const growersRoute = new OpenAPIHono();

growersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/growers-map',
    operationId: 'getGrowersForMap',
    description:
      'Fetch a lightweight array of growers tailored for map markers. Optional filters available for user history and location.',
    tags: [TAGS.GROWERS],
    request: {
      query: MapGrowersQuerySchema,
    },
    responses: {
      200: {
        description: 'Array of lightweight grower marker objects.',
        content: { 'application/json': { schema: MapGrowersResponseSchema } },
      },
      400: {
        description: 'Bad Request - Missing or invalid coordinate combinations.',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');

    // Ensure lat, lng, and maxDistance are used together correctly
    const hasLocationFilters =
      query.lat !== undefined || query.lng !== undefined || query.maxDistance !== undefined;
    const hasCompleteLocationFilters =
      query.lat !== undefined && query.lng !== undefined && query.maxDistance !== undefined;

    if (hasLocationFilters && !hasCompleteLocationFilters) {
      throw new HTTPException(400, {
        message:
          'lat, lng, and maxDistance must all be provided together for bounding distance filtering.',
      });
    }

    const mapGrowers = await getMapGrowers({
      buyerId: query.buyerId,
      lat: query.lat,
      lng: query.lng,
      maxDistance: query.maxDistance,
    });

    return c.json(mapGrowers, 200);
  },
);
