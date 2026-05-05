import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { produce } from '../db/schema.js';

import {
  FulfillmentTypeSchema,
  ImageUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LatitudeSchema,
  LocationSchema,
  LongitudeSchema,
  OrderStatusSchema,
  PaginationQuerySchema,
  PriceDollarsSchema,
  ProduceStatusSchema,
  ProduceTypeSchema,
  ResourceIdSchema,
  SeasonSchema,
  UserIdSchema,
  WeightOzSchema,
} from './common.schema.js';
import { createPaginatedResponseSchema } from './util/pagination.js';

const ProduceFields = z.object({
  title: z.string().min(1).openapi({
    example: 'Organic Honeycrisp Apples',
    description: 'The public title of the produce listing',
  }),
  produceType: ProduceTypeSchema.optional(),
  pricePerOz: PriceDollarsSchema,
  totalOzInventory: WeightOzSchema,
  maxOrderQuantityOz: WeightOzSchema.optional().nullable().openapi({
    example: '160.00',
    description: 'Optional maximum ounces a single user can order per checkout',
  }),
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
    cancelExistingSubscriptions: z.boolean().optional().openapi({
      description:
        'If true, forces cancellation of all active subscriptions. Required if frequency changes.',
    }),
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
    sellerId: UserIdSchema.optional().openapi({
      description: 'Filter for produce owned by this seller.',
    }),
    sortBy: z.enum(['distance', 'price']).optional().openapi({
      description: 'Sort order for the results',
      example: 'distance',
    }),
    hasDelivery: z.enum(['true', 'false']).optional().openapi({
      description: 'Filter for items that offer delivery',
    }),
    produceType: ProduceTypeSchema.optional(),
    search: z.string().optional().openapi({
      description: 'Search produce titles, types, and seller names',
    }),
    maxOrderQuantity: z.coerce.number().optional().openapi({
      description: 'Filter for listings allowing at least this maximum order quantity (oz)',
    }),
    isSubscribable: z.enum(['true', 'false']).optional().openapi({
      description: 'Filter for items that are subscribable',
    }),
    availableInventory: z.coerce.number().optional().openapi({
      description: 'Minimum total available inventory in oz',
    }),
    season: SeasonSchema.optional(),
    availableBy: z.coerce.date().optional().openapi({
      description: 'Filter for items available on or before this date',
    }),
    minPrice: z.coerce.number().optional().openapi({
      description: 'Minimum price per oz',
    }),
    maxPrice: z.coerce.number().optional().openapi({
      description: 'Maximum price per oz',
    }),
    maxDistance: z.coerce.number().optional().openapi({
      description: 'Maximum distance in miles',
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
  produceType: ProduceTypeSchema.optional(),
  search: z.string().optional().openapi({
    description: 'Search produce titles, types, and seller names',
  }),
  maxOrderQuantity: z.coerce.number().optional().openapi({
    description: 'Filter for listings allowing at least this maximum order quantity (oz)',
  }),
  isSubscribable: z.enum(['true', 'false']).optional().openapi({
    description: 'Filter for items that are subscribable',
  }),
  availableInventory: z.coerce.number().optional().openapi({
    description: 'Minimum total available inventory in oz',
  }),
  season: SeasonSchema.optional(),
  availableBy: z.coerce.date().optional().openapi({
    description: 'Filter for items available on or before this date',
  }),
  hasDelivery: z.enum(['true', 'false']).optional(),
  minPrice: z.coerce.number().optional().openapi({
    description: 'Minimum price per oz',
  }),
  maxPrice: z.coerce.number().optional().openapi({
    description: 'Filter for items under a specific price point',
    example: 10,
  }),
});

export const ProduceMapItemSchema = z
  .object({
    id: ResourceIdSchema,
    name: z.string().openapi({ example: 'Kale' }),
    type: ProduceTypeSchema.nullable(),
    thumbnail: ImageUrlSchema.nullable(),
    price: z.string().openapi({ example: '4.50' }),
    availableInventory: z.string().openapi({ example: '160.00' }),
    availableBy: z.date(),
    seasonStart: z.string().openapi({ example: '2024-03-01' }),
    seasonEnd: z.string().openapi({ example: '2024-06-01' }),
    isSubscribable: z.boolean().nullable(),
  })
  .openapi('ProduceMapItem');

export const SellerMapGroupSchema = z
  .object({
    sellerId: UserIdSchema,
    name: z.string().openapi({ description: 'The sellers name' }),
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

export const ProduceAnalyticsSchema = z
  .object({
    totalOzSold: z.number(),
    totalMonthlyEarnings: z.number(),
    numberOfSubscriptions: z.number(),
    numberOfOrders: z.number(),
    percentSold: z.number(),
    upcomingSubscriptionOzNeeded: z.number(),
    availableInventory: z.number(),
    inventorySufficientForUpcoming: z.boolean(),
    nextHarvestDate: z.string().optional(),
  })
  .openapi('ProduceAnalytics');

export const SellerProduceListingSchema = ProduceSchema.extend({
  analytics: ProduceAnalyticsSchema.optional(),
}).openapi('SellerProduceListing');

export const SellerProduceListResponseSchema = createPaginatedResponseSchema(
  SellerProduceListingSchema,
  'SellerProduceListResponse',
);

export const ProduceDetailSchema = ProduceSchema.extend({
  seller: z.object({
    id: UserIdSchema,
    name: z.string().nullable().openapi({ example: 'Smith Family Farm' }),
    image: ImageUrlSchema.nullable(),
    canDeliver: z
      .boolean()
      .default(false)
      .openapi({ description: 'Does the seller do deliveries?' }),
    deliveryRangeMiles: z
      .number()
      .nullable()
      .openapi({ description: 'The sellers maximum delivery range.' }),
    location: LocationSchema.nullable().openapi({ description: 'The sellers pickup location.' }),
  }),
}).openapi('ProduceDetail');

export type ProduceDetailPayload = z.infer<typeof ProduceDetailSchema>;
export type CreateProducePayload = z.infer<typeof CreateProduceSchema>;
export type UpdateProducePayload = z.infer<typeof UpdateProduceSchema>;
