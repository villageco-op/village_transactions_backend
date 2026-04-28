import { z } from '@hono/zod-openapi';

import {
  FulfillmentTypeSchema,
  ImageUrlSchema,
  IsoDateTimeSchema,
  ResourceIdSchema,
  UserIdSchema,
  WeightOzSchema,
} from './common.schema.js';

export const AddToCartSchema = z
  .object({
    productId: ResourceIdSchema,
    quantityOz: WeightOzSchema,
    isSubscription: z.boolean().default(false).openapi({
      example: false,
      description: 'Whether this item should be added as a recurring subscription',
    }),
  })
  .openapi('AddToCartPayload');

export const CartItemSchema = z
  .object({
    reservationId: ResourceIdSchema,
    productId: ResourceIdSchema,
    title: z.string().openapi({
      example: 'Heirloom Tomatoes',
      description: 'Display title of the product',
    }),
    pricePerOz: z.string().openapi({
      example: '0.50',
      description: 'Price per ounce formatted as a string',
    }),
    quantityOz: z.string().openapi({
      example: '16.0',
      description: 'Quantity in ounces currently in cart',
    }),
    maxOrderQuantityOz: z.string().openapi({
      example: '32.0',
      description: 'The maximum allowable order quantity (lowest of stock or seller limit)',
    }),
    isSubscription: z.boolean().nullable().openapi({
      example: false,
      description: 'Flag indicating if this is a subscription item',
    }),
    subscriptionFrequencyDays: z.number().nullable().openapi({
      example: 7,
      description: 'How often the harvest/delivery repeats if this is a subscription',
    }),
    subscriptionCostReductionPercent: z.number().nullable().openapi({
      example: 10,
      description: 'Percentage discount applied to subscription orders',
    }),
    expiresAt: IsoDateTimeSchema,
    images: z.array(ImageUrlSchema).nullable(),
  })
  .openapi('CartItem');

export const UpdateCartGroupSchema = z
  .object({
    fulfillmentType: FulfillmentTypeSchema.openapi({
      description: 'Update the fulfillment type for this entire checkout group',
    }),
  })
  .openapi('UpdateCartGroupPayload');

export type UpdateCartGroupPayload = z.infer<typeof UpdateCartGroupSchema>;

export const CartCheckoutGroupSchema = z
  .object({
    groupId: z.string().openapi({
      example: 'user_1234-onetime',
      description: 'Group ID for this specific checkout session',
    }),
    isSubscription: z.boolean().openapi({
      example: true,
      description: 'True if ANY item in this group is a recurring subscription',
    }),
    frequencyDays: z.number().openapi({
      example: 7,
      description: 'The harvest/delivery interval for this group (0 if one-time)',
    }),
    fulfillmentType: FulfillmentTypeSchema.openapi({
      example: 'pickup',
      description: 'Current fulfillment type selected for this group (pickup or delivery)',
    }),
    availableBy: IsoDateTimeSchema.openapi({
      example: '2026-03-25T10:00:00Z',
      description:
        'The latest availableBy date among all items in this group. Represents when the order can actually be fulfilled.',
    }),
    deliveryFee: z.string().openapi({
      example: '8.50',
      description: 'Estimated delivery fee in USD (applied if user selects delivery)',
    }),
    seller: z
      .object({
        id: UserIdSchema,
        name: z.string().nullable().openapi({ example: 'Sun-Kissed Orchards' }),
      })
      .openapi('CartSeller'),
    items: z.array(CartItemSchema).openapi({
      description: 'List of items in the cart belonging to this checkout group',
    }),
  })
  .openapi('CartCheckoutGroup');

export const GetCartResponseSchema = z
  .object({
    data: z.array(CartCheckoutGroupSchema).openapi({
      description: 'User shopping cart divided into executable checkouts',
    }),
  })
  .openapi('GetCartResponse');

export const UpdateCartSchema = z
  .object({
    quantityOz: WeightOzSchema.optional(),
    isSubscription: z.boolean().optional().openapi({
      example: true,
      description: 'Whether this item should be updated as a recurring subscription',
    }),
  })
  .openapi('UpdateCartPayload');

export type AddToCartPayload = z.infer<typeof AddToCartSchema>;
export type UpdateCartPayload = z.infer<typeof UpdateCartSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
export type CartSeller = z.infer<typeof CartCheckoutGroupSchema>['seller'];
export type CartCheckoutGroup = z.infer<typeof CartCheckoutGroupSchema>;
