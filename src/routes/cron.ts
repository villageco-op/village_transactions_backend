import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { releaseExpiredCarts } from '../services/cart.service.js';

export const cronRoute = new OpenAPIHono();

cronRoute.openapi(
  createRoute({
    method: 'post',
    path: '/release-carts',
    operationId: 'cronReleaseCarts',
    description: 'Cleanup routine triggered by Vercel Cron every 5 minutes.',
    request: {
      headers: z.object({ authorization: z.string().openapi({ example: 'Bearer <CRON_SECRET>' }) }),
    },
    responses: {
      200: {
        description: 'Carts released',
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), count: z.number() }) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { authorization } = c.req.valid('header');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      console.warn('CRON_SECRET environment variable is not set');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (token !== expectedSecret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const count = await releaseExpiredCarts();

    return c.json({ success: true, count }, 200);
  },
);
