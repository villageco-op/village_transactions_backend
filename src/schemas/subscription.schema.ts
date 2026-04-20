import { z } from '@hono/zod-openapi';

import {
  FulfillmentTypeSchema,
  PaginationMetadataSchema,
  PaginationQuerySchema,
  ResourceIdSchema,
  SubscriptionStatusSchema,
  UserBasicInfoSchema,
  UserIdSchema,
} from './common.schema.js';
import { ProduceSchema } from './produce.schema.js';

export const UpdateSubscriptionSchema = z
  .object({
    status: SubscriptionStatusSchema.optional(),
    quantityOz: z.number().positive().optional(),
    fulfillmentType: FulfillmentTypeSchema.optional(),
    cancelReason: z
      .string()
      .max(255)
      .optional()
      .openapi({ description: 'Reason for canceling or pausing.' }),
  })
  .openapi('UpdateSubscriptionPayload');

export const SubscriptionDetailResponseSchema = z
  .object({
    id: ResourceIdSchema,
    buyerId: UserIdSchema,
    productId: ResourceIdSchema,
    sellerId: UserIdSchema,
    quantityOz: z.string(),
    status: SubscriptionStatusSchema,
    cancelReason: z.string().nullable(),
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
  buyerId: UserIdSchema.optional().openapi({ description: 'Filter by buyer ID' }),
  sellerId: UserIdSchema.optional().openapi({ description: 'Filter by seller ID' }),
  productId: ResourceIdSchema.optional().openapi({ description: 'Filter by product ID' }),
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
export type UpdateSubscriptionBody = z.infer<typeof UpdateSubscriptionSchema>;
