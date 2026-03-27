import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import {
  SuccessResponseSchema,
  UpdateSubscriptionStatusSchema,
} from '../schemas/subscription.schema.js';
import { updateSubscriptionStatus } from '../services/subscription.service.js';

export const subscriptionsRoute = new OpenAPIHono();

subscriptionsRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/status',
    operationId: 'updateSubscriptionStatus',
    description:
      'Manage recurring scheduled purchases. Integrates natively with Stripe to pause or cancel collections.',
    middleware: [verifyAuth()],
    request: {
      params: z.object({ id: z.string() }),
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
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
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
