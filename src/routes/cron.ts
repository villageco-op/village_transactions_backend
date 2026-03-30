import { Hono } from 'hono';

import { releaseExpiredCarts } from '../services/cart.service.js';

export const cronRoute = new Hono();

cronRoute.post('/release-carts', async (c) => {
  const authHeader = c.req.header('Authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.warn('CRON_SECRET environment variable is not set');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (token !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const count = await releaseExpiredCarts();

  return c.json({ success: true, count }, 200);
});
