import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const messagingRoute = {
  conversationsRoute: new OpenAPIHono(),
  messagesRoute: new OpenAPIHono(),
};

messagingRoute.conversationsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getConversations',
    description: 'List all active chat threads for the user.',
    responses: {
      200: {
        description: 'Conversations list',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Call get conversations service.
  (c) => c.json([], 200),
);

messagingRoute.messagesRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getMessages',
    description: 'Short-polling endpoint for the active chat screen.',
    request: {
      query: z.object({ conversationId: z.string(), since: z.iso.datetime() }),
    },
    responses: {
      200: {
        description: 'Messages list',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Get data and call get messages service.
  (c) => c.json([], 200),
);

messagingRoute.messagesRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'sendMessage',
    description: 'Send a message.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ conversationId: z.string(), text: z.string() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Message sent',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call send message service.
  (c) => c.json({ success: true }, 200),
);
