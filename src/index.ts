import { serve } from '@hono/node-server';
import { Hono } from 'hono';

/**
 * The core Hono application instance.
 * @remarks
 * Defines the base routing and middleware. Used by both the server and Supertest.
 */
export const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

if (process.env.NODE_ENV !== 'test') {
  serve({
    fetch: app.fetch,
    port: 3000,
  });
}
