import { z } from '@hono/zod-openapi';

export const StripeOnboardingResponseSchema = z
  .object({
    url: z.string().url().openapi({
      example: 'https://connect.stripe.com/setup/s/abcdef123',
      description: 'The temporary Stripe Connect onboarding URL for the seller',
    }),
  })
  .openapi('StripeOnboardingResponse');

export type StripeOnboardingResponse = z.infer<typeof StripeOnboardingResponseSchema>;
