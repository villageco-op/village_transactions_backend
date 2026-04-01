import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { SuccessResponseSchema } from '../schemas/common.schema.js';
import {
  ConversationsResponseSchema,
  GetConversationsQuerySchema,
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
    request: {
      query: GetConversationsQuerySchema,
    },
    responses: {
      200: {
        description: 'Successful retrieval of conversations',
        content: { 'application/json': { schema: ConversationsResponseSchema } },
      },
    },
  }),
  (c) => {
    // const { page, limit } = c.req.valid('query');
    // TODO: [Service] Call get conversations service with pagination.

    return c.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } }, 200);
  },
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
  (c) => {
    // const { conversationId, since, page, limit } = c.req.valid('query');
    // TODO: [Service] Get data and call get messages service.

    return c.json({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } }, 200);
  },
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
