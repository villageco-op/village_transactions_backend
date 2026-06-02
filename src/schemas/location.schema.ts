import { z } from '@hono/zod-openapi';

export const GeocodeRequestSchema = z
  .object({
    address: z.string().optional().openapi({
      example: '123 Farm Lane',
    }),
    city: z.string().optional().openapi({
      example: 'Gary',
    }),
    state: z.string().optional().openapi({
      example: 'IN',
    }),
    zip: z.string().min(5, 'ZIP code is required').openapi({
      example: '46402',
    }),
  })
  .openapi('GeocodePayload');

export const GeocodeResponseSchema = z
  .object({
    lat: z.number().openapi({ example: 41.5934 }),
    lng: z.number().openapi({ example: -87.3464 }),
  })
  .openapi('GeocodeCoordinates');

export type GeocodePayload = z.infer<typeof GeocodeRequestSchema>;
