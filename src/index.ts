import { handle } from 'hono/vercel';

import { app } from './app.js';
import { logger } from './lib/logger.js';

if (process.env.NODE_ENV !== 'production') {
  await import('@hono/node-server').then(({ serve }) => {
    serve({
      fetch: app.fetch,
      port: 3000,
    });
    logger.info('Local dev server running on http://localhost:3000');
  });
}

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
export const PATCH = handle(app);
