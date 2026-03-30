import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { SuccessResponseSchema } from '../schemas/common.schema.js';
import {
  ConversationsResponseSchema,
  GetMessagesQuerySchema,
  MessagesResponseSchema,
  SendMessageBodySchema,
} from '../schemas/messaging.schema.js';

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
    tags: [TAGS.MESSAGING],
    responses: {
      200: {
        description: 'Successful retrieval of conversations',
        content: { 'application/json': { schema: ConversationsResponseSchema } },
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
    tags: [TAGS.MESSAGING],
    request: {
      query: GetMessagesQuerySchema,
    },
    responses: {
      200: {
        description: 'Successful retrieval of messages',
        content: { 'application/json': { schema: MessagesResponseSchema } },
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
    tags: [TAGS.MESSAGING],
    request: {
      body: {
        content: { 'application/json': { schema: SendMessageBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Message sent',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
    },
  }),
  // TODO: [Service] Get data and call send message service.
  (c) => c.json({ success: true }, 200),
);
