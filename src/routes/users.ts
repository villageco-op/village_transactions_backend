import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const usersRoute = new OpenAPIHono();

usersRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getCurrentUser',
    description: 'Fetch profile, settings, and active seller status.',
    responses: {
      200: {
        description: 'User Profile',
        content: { 'application/json': { schema: z.object({ id: z.string() }).passthrough() } },
      },
    },
  }),
  // TODO: [Service] Get data and call get current user service.
  (c) => c.json({ id: 'user_123' }, 200),
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
