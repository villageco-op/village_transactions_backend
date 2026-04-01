import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common.schema.js';
import {
  CancelOrderBodySchema,
  CancelOrderParamsSchema,
  GetOrdersQuerySchema,
  OrdersListResponseSchema,
  RescheduleOrderBodySchema,
  RescheduleOrderParamsSchema,
} from '../schemas/order.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import { cancelOrder, getOrders, rescheduleOrder } from '../services/order.service.js';

export const ordersRoute = new OpenAPIHono();

ordersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getOrders',
    description: 'Get historical or active orders.',
    tags: [TAGS.ORDERS],
    middleware: [verifyAuth()],
    request: {
      query: GetOrdersQuerySchema,
    },
    responses: {
      200: {
        description: 'Orders list',
        content: { 'application/json': { schema: OrdersListResponseSchema } },
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

    const { role, status, timeframe, page, limit } = c.req.valid('query');

    const { offset } = getPaginationParams(page, limit);

    const paginatedOrders = await getOrders(userId, role, status, timeframe, page, limit, offset);

    return c.json(paginatedOrders, 200);
  },
);

ordersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}/schedule',
    operationId: 'rescheduleOrder',
    description: 'Request a change to pickup/delivery time.',
    tags: [TAGS.ORDERS],
    middleware: [verifyAuth()],
    request: {
      params: RescheduleOrderParamsSchema,
      body: {
        content: { 'application/json': { schema: RescheduleOrderBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Order successfully rescheduled',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not Found',
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
    tags: [TAGS.ORDERS],
    middleware: [verifyAuth()],
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
          'application/json': { schema: SuccessResponseSchema },
        },
      },
      400: {
        description: 'Bad Request - e.g., Refund failed or invalid session',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: {
          'application/json': { schema: ErrorResponseSchema },
        },
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
    const { reason } = c.req.valid('json');

    await cancelOrder(id, reason, userId);

    return c.json({ success: true }, 200);
  },
);
