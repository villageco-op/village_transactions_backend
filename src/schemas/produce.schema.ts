import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { produce } from '../db/schema.js';

import {
  FulfillmentTypeSchema,
  ImageUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LatitudeSchema,
  LongitudeSchema,
  OrderStatusSchema,
  PaginationQuerySchema,
  PriceDollarsSchema,
  ProduceStatusSchema,
  ResourceIdSchema,
  UserIdSchema,
  WeightOzSchema,
} from './common.schema.js';
import { createPaginatedResponseSchema } from './util/pagination.js';

const ProduceFields = z.object({
  title: z.string().min(1).openapi({
    example: 'Organic Honeycrisp Apples',
    description: 'The public title of the produce listing',
  }),
  produceType: z.string().optional().openapi({
    example: 'fruit',
    description: 'Category of the produce (e.g., vegetable, fruit, herb)',
  }),
  pricePerOz: PriceDollarsSchema,
  totalOzInventory: WeightOzSchema,
  availableBy: z.coerce.date().optional().openapi({
    example: '2026-03-25T10:00:00Z',
    description: 'The date and time when the produce will be ready for pickup or delivery',
  }),
  harvestFrequencyDays: z.number().int().nonnegative().openapi({
    example: 7,
    description: 'How often this item is typically harvested, in days',
  }),
  seasonStart: IsoDateSchema,
  seasonEnd: IsoDateSchema,
  images: z.array(ImageUrlSchema).openapi({
    example: ['https://example.com/apple.jpg'],
    description: 'List of gallery images for the product',
  }),
  isSubscribable: z.boolean().openapi({
    example: true,
    description: 'Whether customers can set up recurring orders for this item',
  }),
});

export const CreateProduceSchema = ProduceFields.extend({
  images: ProduceFields.shape.images.default([]),
  isSubscribable: ProduceFields.shape.isSubscribable.default(false),
}).openapi('CreateProducePayload');

export const UpdateProduceSchema = ProduceFields.partial()
  .extend({
    status: ProduceStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })
  .openapi('UpdateProducePayload');

export const ProduceListItemSchema = z
  .object({
    id: ResourceIdSchema,
    thumbnail: ImageUrlSchema.nullable(),
    name: z.string().openapi({ example: 'Honeycrisp Apples' }),
    sellerName: z.string().nullable().openapi({ example: 'Smith Family Farm' }),
    sellerId: UserIdSchema,
    price: z.string().openapi({ example: '4.50', description: 'Formatted price string' }),
    amount: z
      .string()
      .openapi({ example: '16oz', description: 'Formatted weight/quantity string' }),
    availableBy: z.date(),
    distance: z.number().openapi({ example: 5.2, description: 'Distance in miles from the user' }),
    isSubscribable: z.boolean().nullable(),
  })
  .openapi('ProduceListItem');

export const ProduceListResponseSchema = createPaginatedResponseSchema(
  ProduceListItemSchema,
  'ProduceListResponse',
);

export const ProduceQuerySchema = z
  .object({
    lat: LatitudeSchema,
    lng: LongitudeSchema,
    sortBy: z.enum(['distance', 'price']).optional().openapi({
      description: 'Sort order for the results',
      example: 'distance',
    }),
    hasDelivery: z.enum(['true', 'false']).optional().openapi({
      description: 'Filter for items that offer delivery',
    }),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('ProduceQuery');

export const ProduceMapQuerySchema = z.object({
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  radiusMiles: z.coerce.number().default(50).openapi({
    description: 'Search radius in miles',
    example: 25,
  }),
  produceType: z.string().optional().openapi({ example: 'spinach' }),
  hasDelivery: z.enum(['true', 'false']).optional(),
  maxPrice: z.coerce.number().optional().openapi({
    description: 'Filter for items under a specific price point',
    example: 10,
  }),
});

export const ProduceMapItemSchema = z
  .object({
    id: ResourceIdSchema,
    name: z.string().openapi({ example: 'Kale' }),
    thumbnail: ImageUrlSchema.nullable(),
  })
  .openapi('ProduceMapItem');

export const SellerMapGroupSchema = z
  .object({
    sellerId: UserIdSchema,
    lat: z.number().openapi({ example: 43.0731 }),
    lng: z.number().openapi({ example: -89.4012 }),
    produce: z.array(ProduceMapItemSchema).openapi({
      description: 'List of produce items available at this specific map location',
    }),
  })
  .openapi('SellerMapGroup');

export const SellerMapGroupListSchema = z.array(SellerMapGroupSchema).openapi('SellerMapGroupList');

export const ProduceOrdersQuerySchema = PaginationQuerySchema.openapi('ProduceOrdersQuery');

export const ProduceOrderBuyerSchema = z
  .object({
    id: UserIdSchema,
    name: z.string().nullable().openapi({ example: 'John Doe' }),
    image: ImageUrlSchema.nullable(),
  })
  .openapi('ProduceOrderBuyer');

export const ProduceOrderListItemSchema = z.object({
  id: ResourceIdSchema,
  status: OrderStatusSchema.nullable(),
  fulfillmentType: FulfillmentTypeSchema,
  scheduledTime: IsoDateSchema,
  totalAmount: z.string().openapi({ example: '25.00' }),
  quantityOz: z.string().openapi({ example: '32.0' }),
  createdAt: IsoDateTimeSchema.nullable(),
  buyer: ProduceOrderBuyerSchema,
});

export const ProduceOrderListResponseSchema = createPaginatedResponseSchema(
  ProduceOrderListItemSchema,
  'ProduceOrderListResponse',
);

export const SellerProduceQuerySchema = z
  .object({
    status: ProduceStatusSchema.optional(),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('SellerProduceQuery');

export const ProduceSchema = createSelectSchema(produce).openapi('Produce');

export const ProduceResponseSchema = createPaginatedResponseSchema(
  ProduceSchema,
  'ProduceResponse',
);

export type CreateProducePayload = z.infer<typeof CreateProduceSchema>;
export type UpdateProducePayload = z.infer<typeof UpdateProduceSchema>;
