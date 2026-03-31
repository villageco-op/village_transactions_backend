import { z } from '@hono/zod-openapi';

import { FulfillmentTypeSchema, IsoDateSchema, UserIdSchema } from './common.schema.js';

export const GetAvailabilityParamsSchema = z.object({
  sellerId: UserIdSchema,
});

export const GetAvailabilityQuerySchema = z.object({
  type: FulfillmentTypeSchema,
  date: IsoDateSchema,
});

export const AvailabilityResponseSchema = z.array(z.string()).openapi('AvailabilityResponse', {
  example: ['09:00', '10:30', '14:00'],
  description: 'An array of available time slots',
});

export type GetAvailabilityParams = z.infer<typeof GetAvailabilityParamsSchema>;
export type GetAvailabilityQuery = z.infer<typeof GetAvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
