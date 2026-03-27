import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { resend } from '../lib/resend.js';
import { ContactRequestSchema } from '../schemas/contact.schema.js';
import { processContactForm } from '../services/contact.service.js';

export const contactRoute = new OpenAPIHono();

contactRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'submitContactForm',
    description: 'Submit a general contact form. Forwards the message and sends an auto-reply.',
    request: {
      body: {
        content: {
          'application/json': { schema: ContactRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Contact form submitted successfully',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      500: {
        description: 'Internal Server Error',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');

    await processContactForm(resend, body);

    return c.json({ success: true }, 200);
  },
);
