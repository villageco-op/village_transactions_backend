import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import {
  ErrorResponseSchema,
  SuccessResponseSchema,
  UserParamSchema,
} from '../schemas/common.schema.js';
import {
  GetSellerReviewsQuerySchema,
  PaginatedReviewsResponseSchema,
} from '../schemas/review.schema.js';
import {
  UpdateScheduleRulesSchema,
  UserProfileSchema,
  UpdateUserSchema,
  PublicUserProfileSchema,
  RegisterFcmTokenSchema,
} from '../schemas/user.schema.js';
import { registerFcmToken } from '../services/notification.service.js';
import { getSellerReviews } from '../services/review.service.js';
import {
  getCurrentUser,
  updateCurrentUser,
  updateScheduleRules,
  getPublicUserProfile,
} from '../services/user.service.js';

export const usersRoute = new OpenAPIHono<RouteEnv>();

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getCurrentUser',
    description: 'Fetch profile, settings, and active seller status.',
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'User Profile Details',
        content: { 'application/json': { schema: UserProfileSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser.session.user.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const log = c.get('logger').child({
      action: 'getCurrentUser',
    });

    const userProfile = await getCurrentUser(userId, log);

    return c.json(userProfile, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/me',
    operationId: 'updateCurrentUser',
    description: 'Update profile (name, address, delivery range, etc.)',
    tags: [TAGS.USERS],
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
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'User not found',
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

    const log = c.get('logger').child({
      action: 'updateCurrentUser',
    });

    await updateCurrentUser(userId, body, log);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'post',
    path: '/fcm-token',
    operationId: 'registerFcmToken',
    description: "Store the user's Firebase Cloud Messaging token for push notifications.",
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': { schema: RegisterFcmTokenSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Token stored',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'User not found',
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

    const { token, platform } = c.req.valid('json');

    const log = c.get('logger').child({
      action: 'registerFcmToken',
      platform,
    });

    await registerFcmToken(userId, token, platform, log);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'put',
    path: '/me/schedule-rules',
    operationId: 'updateScheduleRules',
    description: 'Seller defines their base availability.',
    tags: [TAGS.USERS],
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
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'User not found',
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

    const log = c.get('logger').child({
      action: 'updateScheduleRules',
    });

    await updateScheduleRules(userId, body, log);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/reviews',
    operationId: 'getSellerReviews',
    description: 'Get a paginated list of reviews for a specific seller.',
    tags: [TAGS.USERS],
    request: {
      params: UserParamSchema,
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

    const log = c.get('logger').child({
      action: 'getSellerReviews',
    });

    const result = await getSellerReviews(id, query, log);

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
    tags: [TAGS.USERS],
    request: {
      params: UserParamSchema,
    },
    responses: {
      200: {
        description: 'Public User Profile Details',
        content: { 'application/json': { schema: PublicUserProfileSchema } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const log = c.get('logger').child({
      action: 'getPublicUserProfile',
    });

    const profile = await getPublicUserProfile(id, log);

    return c.json(profile, 200);
  },
);
