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
export const UserIdSchema = z.string().openapi({
  example: 'user_123456789',
  description: 'The unique identifier for the user, prefixed with "user_"',
});

/**
 * Use for general internal resource identifiers
 */
export const ResourceIdSchema = z.uuid().openapi({
  example: '123e4567-e89b-12d3-a456-426614174000',
  description: 'The standard UUID identifier for the resource',
});

export const ProduceStatusSchema = z.enum(produceStatusEnum.enumValues).openapi({
  example: 'active',
  description: 'The status of the produce listing',
});

export const OrderStatusSchema = z.enum(orderStatusEnum.enumValues).openapi({
  example: 'pending',
  description: 'The lifecycle status of the order',
});

export const FulfillmentTypeSchema = z.enum(fulfillmentTypeEnum.enumValues).openapi({
  example: 'delivery',
  description: 'The fulfillment type for completing an order',
});

export const SubscriptionStatusSchema = z.enum(subscriptionStatusEnum.enumValues).openapi({
  example: 'active',
  description: 'The status of the subscription',
});

export const LatitudeSchema = z.coerce.number().min(-90).max(90).openapi({
  example: 37.7749,
  description: 'Latitude coordinate',
});

export const LongitudeSchema = z.coerce.number().min(-180).max(180).openapi({
  example: -122.4194,
  description: 'Longitude coordinate',
});

export const WeightOzSchema = z.number().nonnegative().openapi({
  example: 16.0,
  description: 'Weight in ounces (oz)',
});

export const PriceDollarsSchema = z.number().positive().openapi({
  example: 12.5,
  description: 'Price/Amount in USD',
});

export const ImageUrlSchema = z.string().url().openapi({
  example: 'https://assets.example.com/produce/apples.jpg',
  description: 'A fully qualified URL to an image asset',
});

export const AddressSchema = z.string().min(5).openapi({
  example: '123 Farm Lane, Springfield, OR 97477',
  description: 'Full physical street address',
});

export const IsoDateTimeSchema = z.string().datetime().openapi({
  example: '2026-03-27T09:00:00Z',
  description: 'ISO 8601 UTC timestamp',
});

export const IsoDateSchema = z.string().date().openapi({
  format: 'date',
  example: '2026-03-27',
  description: 'ISO 8601 calendar date (YYYY-MM-DD)',
});

export const ErrorResponseSchema = z.object({ error: z.string() });

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const EntityIdField = z.string().uuid().openapi({
  example: '123e4567-e89b-12d3-a456-426614174000',
});

export const EntityParamSchema = z.object({
  id: EntityIdField,
});

export const SuccessWithEntitySchema = SuccessResponseSchema.extend({
  entityId: EntityIdField,
});

export const UserParamSchema = z.object({
  id: UserIdSchema,
});
