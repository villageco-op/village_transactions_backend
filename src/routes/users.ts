import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import {
  GetSellerReviewsQuerySchema,
  PaginatedReviewsResponseSchema,
} from '../schemas/review.schema.js';
import {
  UpdateScheduleRulesSchema,
  UserProfileSchema,
  UpdateUserSchema,
} from '../schemas/user.schema.js';
import { getSellerReviews } from '../services/review.service.js';
import {
  getCurrentUser,
  registerFcmToken,
  updateCurrentUser,
  updateScheduleRules,
} from '../services/user.service.js';

export const usersRoute = new OpenAPIHono();

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getCurrentUser',
    description: 'Fetch profile, settings, and active seller status.',
    responses: {
      200: {
        description: 'User Profile Details',
        content: { 'application/json': { schema: UserProfileSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser.session.user.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userProfile = await getCurrentUser(userId);

    return c.json(userProfile, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/me',
    operationId: 'updateCurrentUser',
    description: 'Update profile (name, address, delivery range, etc.)',
    request: {
      body: {
        content: {
          'application/json': {
            schema: UpdateUserSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated Profile',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
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

    await updateCurrentUser(userId, body);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'post',
    path: '/fcm-token',
    operationId: 'registerFcmToken',
    description: "Store the user's Firebase Cloud Messaging token for push notifications.",
    request: {
      body: {
        content: {
          'application/json': { schema: z.object({ token: z.string(), platform: z.string() }) },
        },
      },
    },
    responses: {
      200: {
        description: 'Token stored',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { token, platform } = c.req.valid('json');

    await registerFcmToken(userId, token, platform);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/me/schedule-rules',
    operationId: 'updateScheduleRules',
    description: 'Seller defines their base availability.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: UpdateScheduleRulesSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Schedule updated',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
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

    await updateScheduleRules(userId, body);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/reviews',
    operationId: 'getSellerReviews',
    description: 'Get a paginated list of reviews for a specific seller.',
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'User ID of the seller' }),
      }),
      query: GetSellerReviewsQuerySchema,
    },
    responses: {
      200: {
        description: 'A paginated list of seller reviews',
        content: { 'application/json': { schema: PaginatedReviewsResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');

    const result = await getSellerReviews(id, query);

    return c.json(result, 200);
  },
);
