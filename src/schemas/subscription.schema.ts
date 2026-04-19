import { z } from '@hono/zod-openapi';

import {
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

export type UpdateSubscriptionStatusBody = z.infer<typeof UpdateSubscriptionStatusSchema>;
