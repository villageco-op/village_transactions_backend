import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import {
  GetSellerPayoutsQuerySchema,
  PayoutHistoryResponseSchema,
  SellerDashboardResponseSchema,
  SellerEarningsResponseSchema,
} from '../schemas/seller.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import { getSellerPayouts } from '../services/order.service.js';
import { getSellerDashboard, getSellerEarningsMetrics } from '../services/seller.service.js';

export const sellerRoute = new OpenAPIHono();

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/payouts',
    operationId: 'getSellerPayouts',
    description: 'Fetch payout history (last 3 months) tied to Stripe transfers.',
    tags: [TAGS.SELLERS],
    middleware: [verifyAuth()],
    request: {
      query: GetSellerPayoutsQuerySchema,
    },
    responses: {
      200: {
        description: 'Payout history array',
        content: {
          'application/json': {
            schema: PayoutHistoryResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { timeframe, page, limit } = c.req.valid('query');

    const { offset } = getPaginationParams(page, limit);

    const paginatedPayouts = await getSellerPayouts(userId, timeframe, page, limit, offset);

    return c.json(paginatedPayouts, 200);
  },
);

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/earnings',
    operationId: 'getSellerEarnings',
    description: 'Deep dive into financial metrics for the earnings page.',
    tags: [TAGS.SELLERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Seller earnings metrics and statistics',
        content: { 'application/json': { schema: SellerEarningsResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const metrics = await getSellerEarningsMetrics(userId);

    return c.json(metrics, 200);
  },
);

sellerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/dashboard',
    operationId: 'getSellerDashboard',
    description: "Fetches high-level metrics and urgent tasks for the seller's main view.",
    tags: [TAGS.SELLERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Seller dashboard metrics',
        content: { 'application/json': { schema: SellerDashboardResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const dashboardData = await getSellerDashboard(userId);

    return c.json(dashboardData, 200);
  },
);
