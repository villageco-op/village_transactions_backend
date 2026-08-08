import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import {
  ErrorResponseSchema,
  SuccessResponseSchema,
  UserParamSchema,
} from '../schemas/common.schema.js';
import { OrganizationSchema } from '../schemas/organization.schema.js';
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
  UnregisterFcmTokenSchema,
  FcmStatusResponseSchema,
  GetFcmStatusQuerySchema,
} from '../schemas/user.schema.js';
import {
  getFcmStatus,
  registerFcmToken,
  unregisterFcmToken,
} from '../services/notification.service.js';
import { getOrganization } from '../services/organization.service.js';
import { getSellerReviews } from '../services/review.service.js';
import {
  getCurrentUser,
  updateCurrentUser,
  updateScheduleRules,
  getPublicUserProfile,
  deleteAccount,
  leaveOrganization,
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
    method: 'get',
    path: '/me/org',
    operationId: 'getCurrentUserOrganization',
    description: 'Fetch the organization of the currently authenticated user.',
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'User Organization Details',
        content: { 'application/json': { schema: OrganizationSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'User or Organization not found',
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

    const log = c.get('logger').child({
      action: 'getCurrentUserOrganization',
      userId,
    });

    const userProfile = await getCurrentUser(userId, log);

    if (!userProfile?.organizationId) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    const organization = await getOrganization(userProfile.organizationId, log);

    if (!organization) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    return c.json(organization, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'post',
    path: '/me/org/leave',
    operationId: 'leaveOrganization',
    description: 'Leave current organization by clearing organizationId and orgRole.',
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Successfully left organization',
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

    const log = c.get('logger').child({
      action: 'leaveOrganization',
      userId,
    });

    await leaveOrganization(userId, log);

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
    method: 'delete',
    path: '/fcm-token',
    operationId: 'unregisterFcmToken',
    description: "Remove the user's Firebase Cloud Messaging token for the given platform.",
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': { schema: UnregisterFcmTokenSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Token deleted',
        content: { 'application/json': { schema: SuccessResponseSchema } },
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

    const { platform } = c.req.valid('json');

    const log = c.get('logger').child({
      action: 'unregisterFcmToken',
      platform,
    });

    await unregisterFcmToken(userId, platform, log);

    return c.json({ success: true }, 200);
  },
);

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/fcm-status',
    operationId: 'GetFcmStatus',
    description: 'Checks if a token exists for the current user and a given platform.',
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    request: {
      query: GetFcmStatusQuerySchema,
    },
    responses: {
      200: {
        description: 'Status recieved',
        content: { 'application/json': { schema: FcmStatusResponseSchema } },
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

    const { platform } = c.req.valid('query');

    const status = await getFcmStatus(userId, platform);

    return c.json({ status }, 200);
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

usersRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/me',
    operationId: 'deleteAccount',
    description: 'Delete user account, anonymizing personal data to preserve historical orders.',
    tags: [TAGS.USERS],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Account successfully deleted/anonymized',
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

    const log = c.get('logger').child({
      action: 'deleteAccount',
    });

    await deleteAccount(userId, log);

    return c.json({ success: true }, 200);
  },
);
