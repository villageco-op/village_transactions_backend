import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common.schema.js';
import {
  SubscriptionDetailResponseSchema,
  UpdateSubscriptionStatusSchema,
} from '../schemas/subscription.schema.js';
import {
  getSubscriptionDetails,
  updateSubscriptionStatus,
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
    method: 'put',
    path: '/{id}/status',
    operationId: 'updateSubscriptionStatus',
    description:
      'Manage recurring scheduled purchases. Integrates natively with Stripe to pause or cancel collections.',
    tags: [TAGS.SUBSCRIPTIONS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: {
          'application/json': { schema: UpdateSubscriptionStatusSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Status updated',
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
    const { status } = c.req.valid('json');

    await updateSubscriptionStatus(buyerId, id, status);

    return c.json({ success: true }, 200);
  },
);
