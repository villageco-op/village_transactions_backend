import { Hono } from 'hono';

import type { RouteEnv } from '../app.js';
import { releaseExpiredCarts } from '../services/cart.service.js';

export const cronRoute = new Hono<RouteEnv>();

cronRoute.post('/release-carts', async (c) => {
  const log = c.get('logger').child({
    action: 'releaseExpiredCarts',
  });

  const authHeader = c.req.header('Authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    log.error('System configuration error: CRON_SECRET is missing');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (token !== expectedSecret) {
    log.warn('Unauthorized cron trigger attempt');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const count = await releaseExpiredCarts();

  if (count > 0) {
    log.info({ count }, 'Cron job completed: released expired cart reservations');
  }
  return c.json({ success: true, count }, 200);
});
