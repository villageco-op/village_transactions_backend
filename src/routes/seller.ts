import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const sellerRoute = new OpenAPIHono();

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/customers',
    operationId: 'getSellerCustomers',
    description: 'View everyone who has bought before.',
    responses: {
      200: {
        description: 'Customers list',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Call get seller customers service.
  (c) => c.json([], 200),
);

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/analytics',
    operationId: 'getSellerAnalytics',
    description: 'View past sales totals and metrics.',
    request: { query: z.object({ timeframe: z.string() }) },
    responses: {
      200: {
        description: 'Analytics object',
        content: { 'application/json': { schema: z.any() } },
      },
    },
  }),
  // TODO: [Service] Get data and call get seller analytics service.
  (c) => c.json({}, 200),
);
