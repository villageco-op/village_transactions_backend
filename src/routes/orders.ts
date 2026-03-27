import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import {
  CancelOrderBodySchema,
  CancelOrderParamsSchema,
  OrderActionSuccessSchema,
  RescheduleOrderBodySchema,
  RescheduleOrderParamsSchema,
} from '../schemas/order.schema.js';
import { cancelOrder, rescheduleOrder } from '../services/order.service.js';

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
        status: z.enum(['pending', 'completed', 'canceled']),
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
      params: RescheduleOrderParamsSchema,
      body: {
        content: { 'application/json': { schema: RescheduleOrderBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Order successfully rescheduled',
        content: { 'application/json': { schema: OrderActionSuccessSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
      404: {
        description: 'Not Found',
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

    const { id } = c.req.valid('param');
    const { newTime } = c.req.valid('json');

    await rescheduleOrder(id, newTime, userId);

    return c.json({ success: true }, 200);
  },
);

ordersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/cancel',
    operationId: 'cancelOrder',
    description: 'Cancel a one-time order.',
    request: {
      params: CancelOrderParamsSchema,
      body: {
        content: {
          'application/json': { schema: CancelOrderBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Order successfully canceled',
        content: {
          'application/json': { schema: OrderActionSuccessSchema },
        },
      },
      400: {
        description: 'Bad Request - e.g., Refund failed or invalid session',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: {
          'application/json': { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const { id } = c.req.valid('param');
    const { reason } = c.req.valid('json');

    await cancelOrder(id, reason, userId);

    return c.json({ success: true }, 200);
  },
);
