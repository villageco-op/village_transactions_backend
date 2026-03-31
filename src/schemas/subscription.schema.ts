import { z } from '@hono/zod-openapi';

import { SubscriptionStatusSchema } from './common.schema.js';

export const UpdateSubscriptionStatusSchema = z
  .object({
    status: SubscriptionStatusSchema,
  })
  .openapi('UpdateSubscriptionStatusPayload');

export type UpdateSubscriptionStatusBody = z.infer<typeof UpdateSubscriptionStatusSchema>;
