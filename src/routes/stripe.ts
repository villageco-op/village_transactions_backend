import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import Stripe from 'stripe';

import {
  generateStripeOnboardLink,
  processStripeWebhookEvent,
} from '../services/stripe.service.js';

export const stripeRoute = new OpenAPIHono();

stripeRoute.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return c.json({ error: 'Missing stripe signature or secret' }, 400);
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;

  try {
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  await processStripeWebhookEvent(event);

  return c.json({ received: true }, 200);
});

stripeRoute.openapi(
  createRoute({
    method: 'post',
    path: '/connect/onboard',
    operationId: 'generateStripeOnboardingLink',
    description: 'Generate onboarding link for sellers to link their bank accounts.',
    middleware: [verifyAuth()],
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
