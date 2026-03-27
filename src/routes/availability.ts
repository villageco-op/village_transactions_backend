import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const availabilityRoute = new OpenAPIHono();

availabilityRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{sellerId}',
    operationId: 'getAvailability',
    description: 'Fetch available pickup/delivery slots for a seller.',
    request: {
      params: z.object({ sellerId: z.string() }),
      query: z.object({ type: z.enum(['pickup', 'delivery']), date: z.string() }),
    },
    responses: {
      200: {
        description: 'Available slots',
        content: { 'application/json': { schema: z.array(z.string()) } },
      },
    },
  }),
  // TODO: [Service] Get data and call get availability service.
  (c) => c.json([], 200),
);
