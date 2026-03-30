import { z } from '@hono/zod-openapi';

export const ConversationSchema = z
  .object({
    id: z.string().openapi({ example: 'conv_123' }),
    lastMessage: z.string().optional().openapi({ example: 'Hey, are we still meeting?' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-03-29T08:00:00Z' }),
  })
  .openapi('Conversation');

export const ConversationsResponseSchema = z
  .array(ConversationSchema)
  .openapi('ConversationsResponse');

export const GetMessagesQuerySchema = z.object({
  conversationId: z
    .string()
    .openapi({ example: 'conv_123', description: 'The unique ID of the chat thread' }),
  since: z
    .string()
    .datetime()
    .openapi({
      example: '2026-03-29T00:00:00Z',
      description: 'Filter messages updated after this timestamp',
    }),
});

export const MessageSchema = z
  .object({
    id: z.string().openapi({ example: 'msg_987' }),
    senderId: z.string().openapi({ example: 'user_456' }),
    text: z.string().openapi({ example: 'Hello world!' }),
    createdAt: z.string().datetime().openapi({ example: '2026-03-29T08:05:00Z' }),
  })
  .openapi('Message');

export const MessagesResponseSchema = z.array(MessageSchema).openapi('MessagesResponse');

export const SendMessageBodySchema = z
  .object({
    conversationId: z.string().openapi({ example: 'conv_123' }),
    text: z.string().min(1).openapi({ example: 'I will be there in 5 minutes.' }),
  })
  .openapi('SendMessageRequest');

export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
