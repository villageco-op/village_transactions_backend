import { z } from '@hono/zod-openapi';

export const GetAvailabilityParamsSchema = z.object({
  sellerId: z.string().openapi({
    param: {
      name: 'sellerId',
      in: 'path',
    },
    example: 'seller_99',
    description: 'The unique ID of the seller',
  }),
});

export const GetAvailabilityQuerySchema = z.object({
  type: z.enum(['pickup', 'delivery']).openapi({
    param: {
      name: 'type',
      in: 'query',
    },
    example: 'delivery',
    description: 'The type of service fulfillment',
  }),
  date: z.string().openapi({
    param: {
      name: 'date',
      in: 'query',
    },
    example: '2026-03-22',
    description: 'The date to check availability for (ISO format)',
  }),
});

export const AvailabilityResponseSchema = z.array(z.string()).openapi({
  example: ['09:00', '10:30', '14:00'],
  description: 'An array of available time slots',
});

export type GetAvailabilityParams = z.infer<typeof GetAvailabilityParamsSchema>;
export type GetAvailabilityQuery = z.infer<typeof GetAvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
