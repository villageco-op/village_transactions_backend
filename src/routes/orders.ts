import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const ordersRoute = new OpenAPIHono();

ordersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getOrders',
    description: 'Get historical or active orders.',
    request: {
      query: z.object({
        role: z.enum(['buyer', 'seller']),
        status: z.enum(['active', 'completed', 'canceled']),
      }),
    },
    responses: {
      200: {
        description: 'Orders list',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Get data and call get orders service.
  (c) => c.json([], 200),
);

ordersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/schedule',
    operationId: 'rescheduleOrder',
    description: 'Request a change to pickup/delivery time.',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { 'application/json': { schema: z.object({ newTime: z.string().datetime() }) } },
      },
    },
    responses: {
      200: {
        description: 'Rescheduled',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call reschedule order service.
  (c) => c.json({ success: true }, 200),
);

ordersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/cancel',
    operationId: 'cancelOrder',
    description: 'Cancel a one-time order.',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: z.object({ reason: z.string() }) } } },
    },
    responses: {
      200: {
        description: 'Canceled',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call cancel order service.
  (c) => c.json({ success: true }, 200),
);
