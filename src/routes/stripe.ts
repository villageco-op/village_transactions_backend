import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import Stripe from 'stripe';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import { StripeOnboardingResponseSchema } from '../schemas/stripe.schema.js';
import {
  generateStripeOnboardLink,
  processStripeWebhookEvent,
} from '../services/stripe.service.js';

export const stripeRoute = new OpenAPIHono<RouteEnv>();

stripeRoute.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const log = c.get('logger').child({
    action: 'stripeWebhook',
  });

  if (!signature || !webhookSecret) {
    log.warn('Webhook received without signature or secret');
    return c.json({ error: 'Missing stripe signature or secret' }, 400);
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;

  try {
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);

    log.setBindings({ eventType: event.type, eventId: event.id });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: errorMessage }, 'Webhook signature verification failed');
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  await processStripeWebhookEvent(event, log);

  return c.json({ received: true }, 200);
});

stripeRoute.openapi(
  createRoute({
    method: 'post',
    path: '/connect/onboard',
    operationId: 'generateStripeOnboardingLink',
    description: 'Generate onboarding link for sellers to link their bank accounts.',
    tags: [TAGS.STRIPE],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Link created',
        content: { 'application/json': { schema: StripeOnboardingResponseSchema } },
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

    const log = c.get('logger').child({
      action: 'generateStripeOnboardingLink',
    });

    const url = await generateStripeOnboardLink(userId, log);

    return c.json({ url }, 200);
  },
);
