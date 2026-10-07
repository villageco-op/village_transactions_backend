import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createMiddleware } from 'hono/factory';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '10 s'),
});

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
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
