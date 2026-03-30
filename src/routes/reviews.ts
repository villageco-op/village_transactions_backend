import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema, SuccessWithEntitySchema } from '../schemas/common.schema.js';
import { CreateReviewSchema } from '../schemas/review.schema.js';
import { createReview } from '../services/review.service.js';

export const reviewsRoute = new OpenAPIHono();

reviewsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createReview',
    description: 'Leave a star rating and optional comment for a completed order.',
    tags: [TAGS.REVIEWS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateReviewSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Review successfully created',
        content: {
          'application/json': {
            schema: SuccessWithEntitySchema,
          },
        },
      },
      400: {
        description: 'Bad Request (e.g., review already exists)',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = c.req.valid('json');

    const review = await createReview(userId, body);
    return c.json({ success: true, entityId: review.id }, 201);
  },
);
