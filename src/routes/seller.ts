import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { GetSellerPayoutsQuerySchema, PayoutHistorySchema } from '../schemas/seller.schema.js';
import { getSellerPayouts } from '../services/order.service.js';

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

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/payouts',
    operationId: 'getSellerPayouts',
    description: 'Fetch payout history (last 3 months) tied to Stripe transfers.',
    request: {
      query: GetSellerPayoutsQuerySchema,
    },
    responses: {
      200: {
        description: 'Payout history array',
        content: {
          'application/json': {
            schema: PayoutHistorySchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { timeframe } = c.req.valid('query');
    const payouts = await getSellerPayouts(userId, timeframe);

    return c.json(payouts, 200);
  },
);
