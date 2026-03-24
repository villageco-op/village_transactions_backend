import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { orders } from '../db/schema.js';

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

export const RescheduleOrderParamsSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
    },
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The unique UUID of the order to reschedule',
  }),
});

export const RescheduleOrderBodySchema = z.object({
  newTime: z.iso.datetime().openapi({
    example: '2024-12-01T12:00:00.000Z',
    description: 'The new scheduled time for pickup/delivery (ISO 8601 string)',
  }),
});

export const OrderActionSuccessSchema = z.object({
  success: z.boolean().openapi({
    example: true,
  }),
});

export const GetOrdersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).openapi({
    description: 'The perspective from which to fetch orders',
    example: 'buyer',
  }),
  status: z.enum(['pending', 'completed', 'canceled']).optional().openapi({
    description: 'Filter orders by their current status',
    example: 'pending',
  }),
  timeframe: z.string().optional().openapi({
    description: 'Optional timeframe filter (e.g., "7d", "30d", or ISO range)',
    example: 'recent',
  }),
});

export const OrderSchema = createSelectSchema(orders)
  .omit({ stripeSessionId: true })
  .openapi('Order');

export type GetOrdersQuery = z.infer<typeof GetOrdersQuerySchema>;
export type Order = z.infer<typeof OrderSchema>;
export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;
export type CancelOrderBody = z.infer<typeof CancelOrderBodySchema>;
export type RescheduleOrderParams = z.infer<typeof RescheduleOrderParamsSchema>;
export type RescheduleOrderBody = z.infer<typeof RescheduleOrderBodySchema>;
export type OrderActionSuccess = z.infer<typeof OrderActionSuccessSchema>;
