import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

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
            schema: z.object({
              productId: z.string(),
              quantityOz: z.number(),
              isSubscription: z.boolean(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Added to cart',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call add to cart service.
  (c) => c.json({ success: true }, 200),
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
