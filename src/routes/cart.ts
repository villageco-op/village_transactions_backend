import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { AddToCartSchema } from '../schemas/cart.schema.js';
import { addToCart } from '../services/cart.service.js';

export const cartRoute = new OpenAPIHono();

cartRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getCart',
    description:
      "Fetch user's active cart, grouped by seller. Drops expired reservations automatically.",
    responses: {
      200: { description: 'Cart Object', content: { 'application/json': { schema: z.any() } } },
    },
  }),
  // TODO: [Service] Call get cart service.
  (c) => c.json({}, 200),
);

cartRoute.openapi(
  createRoute({
    method: 'post',
    path: '/add',
    operationId: 'addToCart',
    description: 'Add item to cart and create a soft reservation.',
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
    request: { params: z.object({ reservationId: z.string() }) },
    responses: {
      200: {
        description: 'Removed',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Call remove from cart service.
  (c) => c.json({ success: true }, 200),
);
