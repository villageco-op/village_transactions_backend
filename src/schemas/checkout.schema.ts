import { z } from '@hono/zod-openapi';

import { FulfillmentTypeSchema, UserIdSchema } from './common.schema.js';

export const CreateCheckoutSessionSchema = z
  .object({
    groupId: z.string().openapi({
      example: 'user_1234-sub',
      description: 'The checkout group ID.',
    }),
  })
  .openapi('CreateCheckoutSessionPayload');

export type CreateCheckoutSessionPayload = z.infer<typeof CreateCheckoutSessionSchema>;

export const CheckoutSessionResponseSchema = z
  .object({
    url: z.url().openapi({
      example: 'https://checkout.stripe.com/c/pay/cs_test_12345',
      description: 'The URL to redirect the user to for Stripe Checkout.',
    }),
  })
  .openapi('CheckoutSessionResponse');

export const InitiateSnapCheckoutSchema = z
  .object({
    sellerId: UserIdSchema,
    fulfillmentType: FulfillmentTypeSchema,
  })
  .openapi('InitiateSnapCheckoutPayload');
