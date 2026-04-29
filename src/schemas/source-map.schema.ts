import { z } from '@hono/zod-openapi';

import { ProduceTypeSchema, SeasonSchema, UserIdSchema } from './common.schema.js';

export const SourceMapQuerySchema = z
  .object({
    produceType: ProduceTypeSchema.optional(),
    season: SeasonSchema.optional().openapi({
      description: 'Filter map and analytics by the season an order occurred.',
    }),
  })
  .openapi('SourceMapQuery');

export const SourceMapNodeSchema = z
  .object({
    sellerId: UserIdSchema,
    name: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    totalVolumeOz: z.number().openapi({ description: 'Total volume bought from this seller' }),
    totalSpend: z.number().openapi({ description: 'Total amount spent with this seller' }),
    primaryProduceType: z.string().nullable().openapi({
      description: 'The most purchased produce type (useful for map icons)',
    }),
    produceCategories: z.array(z.string()).openapi({
      description: 'List of all produce types bought from this seller',
    }),
  })
  .openapi('SourceMapNode');

export const SourceMapNodesResponseSchema = z
  .array(SourceMapNodeSchema)
  .openapi('SourceMapNodesResponse');

export const ProduceBreakdownSchema = z
  .object({
    produceType: ProduceTypeSchema,
    volumeOz: z.number(),
    percentage: z.number(),
  })
  .openapi('ProduceBreakdown');

export const SourceMapAnalyticsResponseSchema = z
  .object({
    totalSpend: z.number().openapi({ description: 'Total money injected into local economy' }),
    totalVolumeOz: z.number().openapi({ description: 'Total volume of local food purchased' }),
    uniqueGrowers: z.number().openapi({ description: 'Number of local families/farms supported' }),
    foodMilesSaved: z
      .number()
      .openapi({ description: 'Estimated food miles saved vs supermarket' }),
    produceBreakdown: z.array(ProduceBreakdownSchema),
  })
  .openapi('SourceMapAnalyticsResponse');
