import { z } from '@hono/zod-openapi';

import { UserIdSchema } from './common.schema.js';

export const MapGrowersQuerySchema = z
  .object({
    buyerId: z.string().optional().openapi({
      example: 'usr_123',
      description: 'Filter map to only show growers this buyer has completed orders with',
    }),
    lat: z.coerce.number().optional().openapi({
      example: 37.7749,
      description: 'Center latitude for distance filtering',
    }),
    lng: z.coerce.number().optional().openapi({
      example: -122.4194,
      description: 'Center longitude for distance filtering',
    }),
    maxDistance: z.coerce.number().optional().openapi({
      example: 25,
      description: 'Maximum distance in miles from the center point',
    }),
  })
  .openapi('MapGrowersQuery');

export const MapGrowerSchema = z
  .object({
    sellerId: UserIdSchema,
    name: z.string().nullable().openapi({
      example: 'Green Valley Farm',
    }),
    lat: z.number().openapi({ example: 37.7749 }),
    lng: z.number().openapi({ example: -122.4194 }),
    image: z.string().nullable().openapi({
      example: 'https://example.com/profile.jpg',
      description: 'Profile image URL of the grower for avatar map markers',
    }),
    rating: z.number().openapi({
      example: 4.8,
      description: 'Average star rating',
    }),
  })
  .openapi('MapGrower');

export const MapGrowersResponseSchema = z.array(MapGrowerSchema).openapi('MapGrowersResponse');
