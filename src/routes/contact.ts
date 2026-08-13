import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common.schema.js';
import { ContactRequestSchema } from '../schemas/contact.schema.js';
import { processContactForm } from '../services/contact.service.js';

export const contactRoute = new OpenAPIHono<RouteEnv>();

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

    const log = c.get('logger').child({
      action: 'submitContactForm',
      company: body.company,
    });

    if (body.website && body.website.trim() !== '') {
      log.warn(
        { email: body.email },
        'Bot submission detected via honeypot field. Dropping request.',
      );
      return c.json({ success: true }, 200);
    }

    await processContactForm(body, log);

    log.info('Contact form processed and forwarded');
    return c.json({ success: true }, 200);
  },
);
