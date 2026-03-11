import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const subscriptionsRoute = new OpenAPIHono();

subscriptionsRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/status',
    operationId: 'updateSubscriptionStatus',
    description: 'Manage recurring scheduled purchases.',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ status: z.enum(['paused', 'active', 'canceled']) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Status updated',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call update subscription status service.
  (c) => c.json({ success: true }, 200),
);
