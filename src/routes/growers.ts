import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

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
    middleware: [verifyAuth()],
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
      403: {
        description: "You cannot filter by another user's history",
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { buyerId, lat, lng, maxDistance } = c.req.valid('query');

    if (buyerId) {
      const authUser = c.get('authUser');
      const sessionUserId = authUser?.session?.user?.id;

      if (buyerId !== sessionUserId) {
        return c.json({ error: "You cannot filter by another user's history" }, 403);
      }
    }

    // Ensure lat, lng, and maxDistance are used together correctly
    const hasLocationFilters = lat !== undefined || lng !== undefined || maxDistance !== undefined;
    const hasCompleteLocationFilters =
      lat !== undefined && lng !== undefined && maxDistance !== undefined;

    if (hasLocationFilters && !hasCompleteLocationFilters) {
      return c.json(
        {
          error:
            'lat, lng, and maxDistance must all be provided together for bounding distance filtering.',
        },
        400,
      );
    }

    const mapGrowers = await getMapGrowers({
      buyerId: buyerId,
      lat: lat,
      lng: lng,
      maxDistance: maxDistance,
    });

    return c.json(mapGrowers, 200);
  },
);
