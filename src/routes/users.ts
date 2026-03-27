import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import {
  GetSellerReviewsQuerySchema,
  PaginatedReviewsResponseSchema,
} from '../schemas/review.schema.js';
import {
  UpdateScheduleRulesSchema,
  UserProfileSchema,
  UpdateUserSchema,
  PublicUserProfileSchema,
} from '../schemas/user.schema.js';
import { registerFcmToken } from '../services/notification.service.js';
import { getSellerReviews } from '../services/review.service.js';
import {
  getCurrentUser,
  updateCurrentUser,
  updateScheduleRules,
  getPublicUserProfile,
} from '../services/user.service.js';

export const usersRoute = new OpenAPIHono();

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getCurrentUser',
    description: 'Fetch profile, settings, and active seller status.',
    middleware: [verifyAuth()],
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
    middleware: [verifyAuth()],
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
    middleware: [verifyAuth()],
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
    middleware: [verifyAuth()],
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

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    operationId: 'getPublicUserProfile',
    description:
      'Get public seller profile including rating/review stats. Excludes sensitive info.',
    request: {
      params: z.object({
        id: z.string().openapi({ description: 'User ID of the seller' }),
      }),
    },
    responses: {
      200: {
        description: 'Public User Profile Details',
        content: { 'application/json': { schema: PublicUserProfileSchema } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const profile = await getPublicUserProfile(id);

    return c.json(profile, 200);
  },
);
