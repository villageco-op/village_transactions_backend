import { z } from '@hono/zod-openapi';

import {
  PaginationMetadataSchema,
  PaginationQuerySchema,
  ResourceIdSchema,
  SubscriptionStatusSchema,
  UserBasicInfoSchema,
  UserIdSchema,
} from './common.schema.js';
import { ProduceSchema } from './produce.schema.js';

export const UpdateSubscriptionStatusSchema = z
  .object({
    status: SubscriptionStatusSchema,
  })
  .openapi('UpdateSubscriptionStatusPayload');

export const SubscriptionDetailResponseSchema = z
  .object({
    id: z.string(),
    buyerId: UserIdSchema,
    productId: ResourceIdSchema,
    sellerId: UserIdSchema,
    quantityOz: z.string(),
    status: SubscriptionStatusSchema,
    fulfillmentType: z.string(),
    nextDeliveryDate: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    product: ProduceSchema.loose(),
    buyer: UserBasicInfoSchema.nullable(),
    seller: UserBasicInfoSchema.nullable(),
  })
  .openapi('SubscriptionDetailResponse');

export const GetSubscriptionsQuerySchema = PaginationQuerySchema.extend({
  buyerId: z.string().optional().openapi({ description: 'Filter by buyer ID' }),
  sellerId: z.string().optional().openapi({ description: 'Filter by seller ID' }),
  productId: z.string().uuid().optional().openapi({ description: 'Filter by product ID' }),
  status: SubscriptionStatusSchema.optional().openapi({
    description: 'Filter by subscription status',
  }),
}).openapi('GetSubscriptionsQuery');

export const SubscriptionsListResponseSchema = z
  .object({
    data: z.array(SubscriptionDetailResponseSchema),
    meta: PaginationMetadataSchema,
  })
  .openapi('SubscriptionsListResponse');

export type GetSubscriptionsQuery = z.infer<typeof GetSubscriptionsQuerySchema>;
export type UpdateSubscriptionStatusBody = z.infer<typeof UpdateSubscriptionStatusSchema>;
