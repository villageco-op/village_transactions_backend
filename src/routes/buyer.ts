import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import {
  BillingSummaryResponseSchema,
  BuyerDashboardResponseSchema,
  BuyerUserProfileSchema,
  GetGrowersQuerySchema,
  GrowersResponseSchema,
} from '../schemas/buyer.schema.js';
import { ErrorResponseSchema, UserParamSchema } from '../schemas/common.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import {
  getBillingSummary,
  getBuyerDashboardMetrics,
  getBuyerProfile,
  getGrowersForBuyer,
} from '../services/buyer.service.js';

export const buyerRoute = new OpenAPIHono<RouteEnv>();

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/growers',
    operationId: 'getBuyerGrowers',
    description:
      'Get list of sellers that the user bought from in the past, aggregated with stats.',
    tags: [TAGS.BUYERS],
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
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const { page, limit, search, maxDistance } = c.req.valid('query');
    const { offset } = getPaginationParams(page, limit);

    const paginatedGrowers = await getGrowersForBuyer(
      userId,
      page,
      limit,
      offset,
      search,
      maxDistance,
    );

    return c.json(paginatedGrowers, 200);
  },
);

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/billing-summary',
    operationId: 'getBuyerBillingSummary',
    description: 'Get aggregate summary values for the buyer invoice history.',
    tags: [TAGS.BUYERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Aggregate billing summary for the buyer',
        content: { 'application/json': { schema: BillingSummaryResponseSchema } },
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
    tags: [TAGS.BUYERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Dashboard metrics',
        content: { 'application/json': { schema: BuyerDashboardResponseSchema } },
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
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const metrics = await getBuyerDashboardMetrics(userId);

    return c.json(metrics, 200);
  },
);

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    operationId: 'getBuyerProfile',
    description: 'Get public buyer profile including order stats and active subscriptions.',
    tags: [TAGS.BUYERS],
    request: {
      params: UserParamSchema,
    },
    responses: {
      200: {
        description: 'Buyer User Profile Details',
        content: { 'application/json': { schema: BuyerUserProfileSchema } },
      },
      404: {
        description: 'Buyer not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const log = c.get('logger').child({ action: 'getBuyerProfile' });

    const profile = await getBuyerProfile(id, log);
    return c.json(profile, 200);
  },
);
