import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createMiddleware } from 'hono/factory';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '10 s'),
});

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const isE2ETest = c.req.header('x-e2e-neon-db-url') || c.req.header('x-e2e-bypass-ratelimit');
  const isPreview = process.env.VERCEL_ENV === 'preview';

  if (isE2ETest && isPreview) {
    return await next();
  }

  const clientIp =
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'anonymous';

  const { success } = await ratelimit.limit(clientIp);

  if (!success) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  await next();
});
