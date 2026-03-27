import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { generateStripeOnboardLink } from '../services/stripe.service.js';

export const stripeRoute = new OpenAPIHono();

stripeRoute.openapi(
  createRoute({
    method: 'post',
    path: '/webhook',
    operationId: 'handleStripeWebhook',
    description: 'Secure server-to-server listener for Stripe events.',
    request: { body: { content: { 'application/json': { schema: z.any() } } } }, // Webhook payloads are dynamic
    responses: {
      200: {
        description: 'Received',
        content: { 'application/json': { schema: z.object({ received: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call handle Stripe webhook service.
  (c) => c.json({ received: true }, 200),
);

stripeRoute.openapi(
  createRoute({
    method: 'post',
    path: '/connect/onboard',
    operationId: 'generateStripeOnboardingLink',
    description: 'Generate onboarding link for sellers to link their bank accounts.',
    responses: {
      200: {
        description: 'Link created',
        content: { 'application/json': { schema: z.object({ url: z.string() }) } },
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

    const url = await generateStripeOnboardLink(userId);

    return c.json({ url }, 200);
  },
);
