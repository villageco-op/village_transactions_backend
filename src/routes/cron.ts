import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const cronRoute = new OpenAPIHono();

cronRoute.openapi(
  createRoute({
    method: 'post',
    path: '/release-carts',
    operationId: 'cronReleaseCarts',
    description: 'Cleanup routine triggered by Vercel Cron every 5 minutes.',
    request: {
      headers: z.object({ authorization: z.string() }),
    },
    responses: {
      200: {
        description: 'Carts released',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  (c) => {
    // TODO: [Validate] Validate the Bearer token matches CRON_SECRET
    // TODO: [Service] Call release carts service.
    return c.json({ success: true }, 200);
  },
);
