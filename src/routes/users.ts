import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { UserProfileSchema } from '../schemas/user.schema.js';
import { getCurrentUser } from '../services/user.service.js';

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
            schema: z.object({
              name: z.string(),
              address: z.string(),
              lat: z.number(),
              lng: z.number(),
              deliveryRangeMiles: z.number(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated Profile',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call upate current user service.
  (c) => c.json({ success: true }, 200),
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
    },
  }),
  // TODO: [Service] Get data and call register FCM token service.
  (c) => c.json({ success: true }, 200),
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
            schema: z.object({
              pickupWindows: z.array(
                z.object({ day: z.string(), start: z.string(), end: z.string() }),
              ),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Schedule updated',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call update schedule routes service.
  (c) => c.json({ success: true }, 200),
);
