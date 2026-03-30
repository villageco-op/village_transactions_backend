import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import {
  CreateCheckoutSessionSchema,
  CheckoutSessionResponseSchema,
  InitiateSnapCheckoutSchema,
} from '../schemas/checkout.schema.js';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common.schema.js';
import { createCheckoutSession } from '../services/stripe.service.js';

export const checkoutRoute = new OpenAPIHono();

checkoutRoute.openapi(
  createRoute({
    method: 'post',
    path: '/stripe/session',
    operationId: 'createStripeSession',
    description: 'Create a Stripe Checkout session for a specific seller.',
    tags: [TAGS.CHECKOUT],
    middleware: [verifyAuth()],
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
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
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
    tags: [TAGS.CHECKOUT],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: InitiateSnapCheckoutSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SNAP Init',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
    },
  }),
  // TODO: [Service] Get data and call SNAP checkout service.
  (c) => c.json({ success: true }, 200),
);
