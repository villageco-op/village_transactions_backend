import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { resend } from '../lib/resend.js';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common.schema.js';
import { ContactRequestSchema } from '../schemas/contact.schema.js';
import { processContactForm } from '../services/contact.service.js';

export const contactRoute = new OpenAPIHono();

contactRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'submitContactForm',
    description: 'Submit a general contact form. Forwards the message and sends an auto-reply.',
    tags: [TAGS.CONTACT],
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
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      500: {
        description: 'Internal Server Error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');

    await processContactForm(resend, body);

    return c.json({ success: true }, 200);
  },
);
