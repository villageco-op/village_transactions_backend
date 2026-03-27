import { z } from '@hono/zod-openapi';

export const CreateCheckoutSessionSchema = z.object({
  sellerId: z.string().openapi({
    example: 'sel_12345',
    description: 'The unique identifier of the seller.',
  }),
  fulfillmentType: z.enum(['pickup', 'delivery']).openapi({
    example: 'pickup',
    description: 'The method by which the buyer will receive the goods.',
  }),
  scheduledTime: z.iso.datetime().openapi({
    example: '2026-03-20T14:30:00Z',
    description: 'ISO 8601 formatted date and time for fulfillment.',
  }),
});

export type CreateCheckoutSessionPayload = z.infer<typeof CreateCheckoutSessionSchema>;

export const CheckoutSessionResponseSchema = z.object({
  url: z.url().openapi({
    example: 'https://checkout.stripe.com/c/pay/cs_test_12345',
    description: 'The URL to redirect the user to for Stripe Checkout.',
  }),
});
