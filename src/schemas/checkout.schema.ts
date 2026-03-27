import { z } from '@hono/zod-openapi';

import { FulfillmentTypeSchema, IsoDateTimeSchema, UserIdSchema } from './common.schema.js';

export const CreateCheckoutSessionSchema = z.object({
  sellerId: UserIdSchema,
  fulfillmentType: FulfillmentTypeSchema,
  scheduledTime: IsoDateTimeSchema,
});

export type CreateCheckoutSessionPayload = z.infer<typeof CreateCheckoutSessionSchema>;

export const CheckoutSessionResponseSchema = z.object({
  url: z.url().openapi({
    example: 'https://checkout.stripe.com/c/pay/cs_test_12345',
    description: 'The URL to redirect the user to for Stripe Checkout.',
  }),
});
