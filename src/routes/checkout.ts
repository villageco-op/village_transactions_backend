import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import {
  CreateCheckoutSessionSchema,
  CheckoutSessionResponseSchema,
} from '../schemas/checkout.schema.js';
import { createCheckoutSession } from '../services/stripe.service.js';

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
            schema: CreateCheckoutSessionSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Session created',
        content: { 'application/json': { schema: CheckoutSessionResponseSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const buyerId = authUser?.session?.user?.id;

    if (!buyerId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = c.req.valid('json');

    const url = await createCheckoutSession(buyerId, payload);

    return c.json({ url }, 200);
  },
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
