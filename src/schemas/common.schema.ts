import { z } from '@hono/zod-openapi';

import {
  produceStatusEnum,
  orderStatusEnum,
  fulfillmentTypeEnum,
  subscriptionStatusEnum,
} from '../db/schema.js';

/**
 * Use for Public/External facing User IDs (e.g., user_23...)
 */
export const UserIdSchema = z.string().openapi('UserId', {
  example: 'user_123456789',
  description: 'The unique identifier for the user, prefixed with "user_"',
});

/**
 * Use for general internal resource identifiers
 */
export const ResourceIdSchema = z.uuid().openapi('ResourceId', {
  example: '123e4567-e89b-12d3-a456-426614174000',
  description: 'The standard UUID identifier for the resource',
});

export const ProduceStatusSchema = z.enum(produceStatusEnum.enumValues).openapi('ProduceStatus', {
  example: 'active',
  description: 'The status of the produce listing',
});

export const OrderStatusSchema = z.enum(orderStatusEnum.enumValues).openapi('OrderStatus', {
  example: 'pending',
  description: 'The lifecycle status of the order',
});

export const FulfillmentTypeSchema = z
  .enum(fulfillmentTypeEnum.enumValues)
  .openapi('FulfillmentType', {
    example: 'delivery',
    description: 'The fulfillment type for completing an order',
  });

export const SubscriptionStatusSchema = z
  .enum(subscriptionStatusEnum.enumValues)
  .openapi('SubscriptionStatus', {
    example: 'active',
    description: 'The status of the subscription',
  });

export const LatitudeSchema = z.coerce.number().min(-90).max(90).openapi('Latitude', {
  example: 37.7749,
  description: 'Latitude coordinate',
});

export const LongitudeSchema = z.coerce.number().min(-180).max(180).openapi('Longitude', {
  example: -122.4194,
  description: 'Longitude coordinate',
});

export const WeightOzSchema = z.number().nonnegative().openapi('WeightOz', {
  example: 16.0,
  description: 'Weight in ounces (oz)',
});

export const PriceDollarsSchema = z.number().positive().openapi('PriceDollars', {
  example: 12.5,
  description: 'Price/Amount in USD',
});

export const ImageUrlSchema = z.string().url().openapi('ImageUrl', {
  example: 'https://assets.example.com/produce/apples.jpg',
  description: 'A fully qualified URL to an image asset',
});

export const AddressSchema = z.string().min(5).openapi('Address', {
  example: '123 Farm Lane, Springfield, OR 97477',
  description: 'Full physical street address',
});

export const LocationSchema = z
  .object({
    lat: z.number().nullable().openapi({ example: 37.7749 }),
    lng: z.number().nullable().openapi({ example: -122.4194 }),
    address: AddressSchema.nullable(),
  })
  .openapi('Location');

export const IsoDateTimeSchema = z.string().datetime().openapi('IsoDateTime', {
  example: '2026-03-27T09:00:00Z',
  description: 'ISO 8601 UTC timestamp',
});

export const IsoDateSchema = z.string().date().openapi('IsoDate', {
  format: 'date',
  example: '2026-03-27',
  description: 'ISO 8601 calendar date (YYYY-MM-DD)',
});

export const ErrorResponseSchema = z.object({ error: z.string() }).openapi('ErrorResponse');

export const SuccessResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .openapi('SuccessResponse');

export const EntityIdField = z.string().uuid().openapi('EntityId', {
  example: '123e4567-e89b-12d3-a456-426614174000',
});

export const EntityParamSchema = z
  .object({
    id: EntityIdField,
  })
  .openapi('EntityParam');

export const SuccessWithEntitySchema = SuccessResponseSchema.extend({
  entityId: EntityIdField,
}).openapi('SuccessWithEntity');

export const UserParamSchema = z
  .object({
    id: UserIdSchema,
  })
  .openapi('UserParam');

export const PaginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .openapi({ example: 1, description: 'The page number for pagination' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .openapi({ example: 10, description: 'Number of items to return per page' }),
});

export const PaginationMetadataSchema = z
  .object({
    total: z.number().openapi({ example: 45, description: 'Total number of items available' }),
    page: z.number().openapi({ example: 1 }),
    limit: z.number().openapi({ example: 10 }),
    totalPages: z.number().openapi({ example: 5 }),
  })
  .openapi('PaginationMetadata');

export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;
