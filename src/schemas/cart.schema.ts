import { z } from '@hono/zod-openapi';

export const AddToCartSchema = z.object({
  productId: z.uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  quantityOz: z.number().positive().openapi({ example: 16.5 }),
  isSubscription: z.boolean().default(false).openapi({ example: false }),
});

export type AddToCartPayload = z.infer<typeof AddToCartSchema>;

export const CartItemSchema = z.object({
  reservationId: z.uuid(),
  productId: z.uuid(),
  title: z.string(),
  pricePerOz: z.string(),
  quantityOz: z.string(),
  isSubscription: z.boolean().nullable(),
  expiresAt: z.iso.datetime(),
  images: z.array(z.string()).nullable(),
});

export const CartSellerGroupSchema = z.object({
  seller: z.object({
    id: z.string(),
    name: z.string().nullable(),
  }),
  items: z.array(CartItemSchema),
});

export const GetCartResponseSchema = z.object({
  cart: z.array(CartSellerGroupSchema),
});
