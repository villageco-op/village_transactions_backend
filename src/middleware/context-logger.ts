import { createMiddleware } from 'hono/factory';

import type { AppBindings } from '../app.js';
import { logger as rootLogger } from '../lib/logger.js';

export const contextLoggerMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const authUser = c.get('authUser');
  const userId = authUser?.session?.user?.id;

  const requestLogger = rootLogger.child({
    userId: userId || 'anonymous',
    traceId: crypto.randomUUID(),
  });

  c.set('logger', requestLogger);

  await next();
});
