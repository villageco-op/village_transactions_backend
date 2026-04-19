import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { orders } from '../db/schema.js';

import {
  IsoDateTimeSchema,
  OrderStatusSchema,
  PaginationQuerySchema,
  ResourceIdSchema,
  UserBasicInfoSchema,
} from './common.schema.js';
import { createPaginatedResponseSchema } from './util/pagination.js';

export const CancelOrderParamsSchema = z.object({
  id: ResourceIdSchema,
});

export const CancelOrderBodySchema = z
  .object({
    reason: z.string().min(1).openapi({
      example: 'Changed my mind',
      description: 'The reason for canceling the order',
    }),
  })
  .openapi('CancelOrderPayload');

export const RescheduleOrderParamsSchema = z.object({
  id: ResourceIdSchema,
});

export const RescheduleOrderBodySchema = z
  .object({
    newTime: IsoDateTimeSchema,
  })
  .openapi('RescheduleOrderPayload');

export const GetOrdersQuerySchema = z
  .object({
    role: z.enum(['buyer', 'seller']).openapi({
      description: 'The perspective from which to fetch orders',
      example: 'buyer',
    }),
    status: OrderStatusSchema.optional(),
    timeframe: z.string().optional().openapi({
      description: 'Optional timeframe filter (e.g., "7d", "30d", or ISO range)',
      example: 'recent',
    }),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('GetOrdersQuery');

export const OrderSchema = createSelectSchema(orders)
  .omit({ stripeSessionId: true })
  .openapi('Order');

export const OrdersListResponseSchema = createPaginatedResponseSchema(
  OrderSchema,
  'OrdersListResponse',
);

export const GetOrderParamsSchema = z.object({
  id: ResourceIdSchema,
});

export const OrderItemDetailSchema = z.object({
  id: ResourceIdSchema,
  productId: ResourceIdSchema,
  productName: z.string(),
  quantityOz: z.string(),
  pricePerOz: z.string(),
});

export const OrderDetailResponseSchema = OrderSchema.extend({
  buyer: UserBasicInfoSchema.nullable(),
  seller: UserBasicInfoSchema.nullable(),
  items: z.array(OrderItemDetailSchema),
}).openapi('OrderDetailResponse');

export type GetOrderParams = z.infer<typeof GetOrderParamsSchema>;
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;

export type GetOrdersQuery = z.infer<typeof GetOrdersQuerySchema>;
export type Order = z.infer<typeof OrderSchema>;
export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;
export type CancelOrderBody = z.infer<typeof CancelOrderBodySchema>;
export type RescheduleOrderParams = z.infer<typeof RescheduleOrderParamsSchema>;
export type RescheduleOrderBody = z.infer<typeof RescheduleOrderBodySchema>;
