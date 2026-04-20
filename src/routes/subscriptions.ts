import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common.schema.js';
import {
  GetSubscriptionsQuerySchema,
  SubscriptionDetailResponseSchema,
  SubscriptionsListResponseSchema,
  UpdateSubscriptionSchema,
} from '../schemas/subscription.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import {
  getSubscriptionDetails,
  getSubscriptions,
  updateSubscription,
} from '../services/subscription.service.js';

export const subscriptionsRoute = new OpenAPIHono();

subscriptionsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    operationId: 'getSubscriptionById',
    description:
      'Get detailed information for a specific subscription by ID. Accessible only by the buyer or seller associated with the subscription.',
    tags: [TAGS.SUBSCRIPTIONS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Subscription details successfully retrieved',
        content: { 'application/json': { schema: SubscriptionDetailResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not Found - Subscription does not exist or user lacks permission to view it',
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

    const { id } = c.req.valid('param');

    const subscriptionDetails = await getSubscriptionDetails(id, userId);

    return c.json(subscriptionDetails, 200);
  },
);

subscriptionsRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    operationId: 'updateSubscription',
    description:
      'Update a subscription quantity, status (pause/cancel), or fulfillment type. Syncs natively with Stripe.',
    tags: [TAGS.SUBSCRIPTIONS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: {
          'application/json': { schema: UpdateSubscriptionSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Subscription updated',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const buyerId = authUser?.session?.user?.id;

    if (!buyerId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { id } = c.req.valid('param');
    const updates = c.req.valid('json');

    await updateSubscription(buyerId, id, updates);

    return c.json({ success: true }, 200);
  },
);

subscriptionsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getSubscriptions',
    description:
      'Get a paginated list of subscriptions. Filterable by buyerId, sellerId, productId, and status.',
    tags: [TAGS.SUBSCRIPTIONS],
    middleware: [verifyAuth()],
    request: {
      query: GetSubscriptionsQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated subscriptions list',
        content: { 'application/json': { schema: SubscriptionsListResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      403: {
        description: 'Forbidden - Attempting to access data outside user scope',
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

    const query = c.req.valid('query');
    const { offset } = getPaginationParams(query.page, query.limit);

    const paginatedSubscriptions = await getSubscriptions(userId, query, offset);

    return c.json(paginatedSubscriptions, 200);
  },
);
