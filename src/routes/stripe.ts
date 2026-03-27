import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

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
    },
  }),
  // TODO: [Service] Call Stripe Connect onboard service.
  (c) => c.json({ url: 'https://connect.stripe.com/...' }, 200),
);
