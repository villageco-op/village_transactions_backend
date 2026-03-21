import { z } from '@hono/zod-openapi';

export const UpdateSubscriptionStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']).openapi({
    example: 'active',
    description: 'The new status for the subscription',
  }),
});

export type UpdateSubscriptionStatusBody = z.infer<typeof UpdateSubscriptionStatusSchema>;

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
});
