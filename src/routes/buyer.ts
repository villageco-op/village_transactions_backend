import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import {
  BillingSummaryResponseSchema,
  BuyerDashboardResponseSchema,
  GetGrowersQuerySchema,
  GrowersResponseSchema,
} from '../schemas/buyer.schema.js';
import {
  getBillingSummary,
  getBuyerDashboardMetrics,
  getGrowersForBuyer,
} from '../services/buyer.service.js';

export const buyerRoute = new OpenAPIHono();

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/growers',
    operationId: 'getBuyerGrowers',
    description:
      'Get list of sellers that the user bought from in the past, aggregated with stats.',
    middleware: [verifyAuth()],
    request: {
      query: GetGrowersQuerySchema,
    },
    responses: {
      200: {
        description: 'List of growers the buyer previously ordered from.',
        content: { 'application/json': { schema: GrowersResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const { limit, offset } = c.req.valid('query');

    const growers = await getGrowersForBuyer(userId, limit, offset);

    return c.json(growers, 200);
  },
);

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/billing-summary',
    operationId: 'getBuyerBillingSummary',
    description: 'Get aggregate summary values for the buyer invoice history.',
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Aggregate billing summary for the buyer',
        content: { 'application/json': { schema: BillingSummaryResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const summary = await getBillingSummary(userId);

    return c.json(summary, 200);
  },
);

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/dashboard',
    operationId: 'getBuyerDashboard',
    description: 'Fetches all summary metrics required for the buyer main dashboard view.',
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Dashboard metrics',
        content: { 'application/json': { schema: BuyerDashboardResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const metrics = await getBuyerDashboardMetrics(userId);

    return c.json(metrics, 200);
  },
);
