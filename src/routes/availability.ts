import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import {
  AvailabilityResponseSchema,
  GetAvailabilityParamsSchema,
  GetAvailabilityQuerySchema,
} from '../schemas/availability.schema.js';
import { getAvailability } from '../services/availability.service.js';

export const availabilityRoute = new OpenAPIHono();

availabilityRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{sellerId}',
    operationId: 'getAvailability',
    description: 'Fetch available pickup/delivery slots for a seller.',
    tags: [TAGS.AVAILABILITY],
    middleware: [verifyAuth()],
    request: {
      params: GetAvailabilityParamsSchema,
      query: GetAvailabilityQuerySchema,
    },
    responses: {
      200: {
        description: 'Available slots',
        content: { 'application/json': { schema: AvailabilityResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { sellerId } = c.req.valid('param');
    const { type, date } = c.req.valid('query');

    const availableSlots = await getAvailability(sellerId, date, type);

    return c.json(availableSlots, 200);
  },
);
