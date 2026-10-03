import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

export const stagingGuardMiddleware = createMiddleware(async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    c.status(204);
    return c.body(null);
  }

  const isStripeWebhook = c.req.path.startsWith('/api/stripe/webhook');

  if (process.env.VERCEL_ENV === 'preview' && !isStripeWebhook) {
    const stagingCookie = getCookie(c, 'village_staging_access');
    const expectedKey = process.env.STAGING_SECRET_KEY;

    if (!stagingCookie || stagingCookie !== expectedKey) {
      c.status(401);
      return c.json({ error: 'Staging environment locked. Missing valid preview session.' });
    }
  }

  await next();
});
