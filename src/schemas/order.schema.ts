import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { orders } from '../db/schema.js';

import { IsoDateTimeSchema, OrderStatusSchema, ResourceIdSchema } from './common.schema.js';

export const CancelOrderParamsSchema = z.object({
  id: ResourceIdSchema,
});

export const CancelOrderBodySchema = z.object({
  reason: z.string().min(1).openapi({
    example: 'Changed my mind',
    description: 'The reason for canceling the order',
  }),
});

export const RescheduleOrderParamsSchema = z.object({
  id: ResourceIdSchema,
});

export const RescheduleOrderBodySchema = z.object({
  newTime: IsoDateTimeSchema,
});

export const OrderActionSuccessSchema = z.object({
  success: z.boolean().openapi({
    example: true,
    description: 'Indicates if the requested order action was processed successfully',
  }),
});

export const GetOrdersQuerySchema = z.object({
  role: z.enum(['buyer', 'seller']).openapi({
    description: 'The perspective from which to fetch orders',
    example: 'buyer',
  }),
  status: OrderStatusSchema.optional(),
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
