import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { AddToCartSchema, GetCartResponseSchema } from '../schemas/cart.schema.js';
import { addToCart, getCart, removeFromCart } from '../services/cart.service.js';

export const cartRoute = new OpenAPIHono();

cartRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getCart',
    description:
      "Fetch user's active cart, grouped by seller. Drops expired reservations automatically.",
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Cart Object',
        content: { 'application/json': { schema: GetCartResponseSchema } },
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

    const cart = await getCart(userId);
    return c.json({ cart }, 200);
  },
);

cartRoute.openapi(
  createRoute({
    method: 'post',
    path: '/add',
    operationId: 'addToCart',
    description: 'Add item to cart and create a soft reservation.',
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: AddToCartSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Added to cart',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              reservationId: z.uuid(),
            }),
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

    const body = c.req.valid('json');

    const reservation = await addToCart(userId, body);

    return c.json({ success: true, reservationId: reservation.id }, 200);
  },
);

cartRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/remove/{reservationId}',
    operationId: 'removeFromCart',
    description: 'Explicitly remove an item and release the reservation early.',
    middleware: [verifyAuth()],
    request: {
      params: z.object({
        reservationId: z.uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
      }),
    },
    responses: {
      200: {
        description: 'Removed',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
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

    const { reservationId } = c.req.valid('param');

    const success = await removeFromCart(userId, reservationId);

    return c.json({ success }, 200);
  },
);
