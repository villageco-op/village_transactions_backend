import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const checkoutRoute = new OpenAPIHono();

checkoutRoute.openapi(
  createRoute({
    method: 'post',
    path: '/stripe/session',
    operationId: 'createStripeSession',
    description: 'Create a Stripe Checkout session for a specific seller.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              sellerId: z.string(),
              fulfillmentType: z.enum(['pickup', 'delivery']),
              scheduledTime: z.iso.datetime(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Session created',
        content: { 'application/json': { schema: z.object({ url: z.string() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call create Stripe session service.
  (c) => c.json({ url: 'https://checkout.stripe.com/...' }, 200),
);

checkoutRoute.openapi(
  createRoute({
    method: 'post',
    path: '/snap/initiate',
    operationId: 'initiateSnapCheckout',
    description: 'Alternate checkout route for USDA EBT/SNAP.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ sellerId: z.string(), fulfillmentType: z.literal('pickup') }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SNAP Init',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call SNAP checkout service.
  (c) => c.json({ success: true }, 200),
);
