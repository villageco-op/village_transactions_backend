import { Hono } from 'hono';

import type { RouteEnv } from '../app.js';
import {
  generateAuthJsCookieValue,
  seedTestProduce,
  seedTestUser,
} from '../services/testing.service.js';
import { getLatestVerificationToken } from '../services/verification.service.js';

export const testingRoute = new Hono<RouteEnv>();

if (process.env.VERCEL_ENV === 'preview') {
  testingRoute.get('/', async (c) => {
    const { email } = c.req.query();
    const log = c.get('logger').child({ action: 'getLatestMagicToken', email });

    const tokenData = await getLatestVerificationToken(email, log);
    return c.json(tokenData, 200);
  });

  testingRoute.post('/seed-user', async (c) => {
    const log = c.get('logger').child({ action: 'seedTestUser' });
    const body = await c.req.json();

    try {
      const newUser = await seedTestUser(body, log);
      return c.json({ success: true, user: newUser }, 201);
    } catch (error) {
      log.error({ error }, 'Failed to provision test user');
      return c.json({ error: 'Failed to seed user' }, 500);
    }
  });

  testingRoute.post('/test-login', async (c) => {
    const log = c.get('logger').child({ action: 'testLoginBypass' });
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Missing target email address' }, 400);
    }

    try {
      const cookieValue = await generateAuthJsCookieValue(email);

      const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL_ENV;
      const cookieName = isLocal ? 'authjs.session-token' : '__Secure-authjs.session-token';

      c.header(
        'Set-Cookie',
        `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${isLocal ? '' : '; Secure'}`,
      );

      return c.json({ success: true });
    } catch (error) {
      log.error({ error, email }, 'Failed to generate bypass session cookie');
      return c.json({ error: 'Authentication bypass generation failed' }, 500);
    }
  });

  testingRoute.post('/seed-produce', async (c) => {
    const log = c.get('logger').child({ action: 'seedTestProduce' });

    try {
      const body = await c.req.json();

      if (!body.email) {
        return c.json({ error: 'Missing seller email address' }, 400);
      }

      const newProduce = await seedTestProduce(
        {
          email: body.email,
          produce: body.produce ?? {},
        },
        log,
      );

      return c.json({ success: true, produce: newProduce }, 201);
    } catch (error) {
      log.error({ error }, 'Failed to seed produce listing');
      return c.json({ error: (error as Error).message || 'Failed to seed produce' }, 500);
    }
  });
}
