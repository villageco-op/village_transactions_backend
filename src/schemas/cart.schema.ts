import { z } from '@hono/zod-openapi';

import {
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

export type AddToCartPayload = z.infer<typeof AddToCartSchema>;

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
    isSubscription: z.boolean().nullable().openapi({
      example: false,
      description: 'Flag indicating if this is a subscription item',
    }),
    expiresAt: IsoDateTimeSchema,
    images: z.array(ImageUrlSchema).nullable(),
  })
  .openapi('CartItem');

export const CartSellerGroupSchema = z
  .object({
    seller: z
      .object({
        id: UserIdSchema,
        name: z.string().nullable().openapi({
          example: 'Sun-Kissed Orchards',
          description: 'The name of the seller providing these items',
        }),
      })
      .openapi('CartSeller'),
    items: z.array(CartItemSchema).openapi({
      description: 'List of items in the cart belonging to this specific seller',
    }),
  })
  .openapi('CartSellerGroup');

export const GetCartResponseSchema = z
  .object({
    data: z.array(CartSellerGroupSchema).openapi({
      description: 'User shopping cart grouped by seller',
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

export type UpdateCartPayload = z.infer<typeof UpdateCartSchema>;
