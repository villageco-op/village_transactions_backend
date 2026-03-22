import { z } from '@hono/zod-openapi';

export const CancelOrderParamsSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
    },
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The unique UUID of the order to cancel',
  }),
});

export const CancelOrderBodySchema = z.object({
  reason: z.string().min(1).openapi({
    example: 'Changed my mind',
    description: 'The reason for canceling the order',
  }),
});

export const OrderActionSuccessSchema = z.object({
  success: z.boolean().openapi({
    example: true,
  }),
});

export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;
export type CancelOrderBody = z.infer<typeof CancelOrderBodySchema>;
export type OrderActionSuccess = z.infer<typeof OrderActionSuccessSchema>;
