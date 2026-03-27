import { z } from '@hono/zod-openapi';

export const GetGrowersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20).openapi({
    example: 20,
    description: 'Number of results to return',
  }),
  offset: z.coerce.number().min(0).optional().default(0).openapi({
    example: 0,
    description: 'Number of results to skip',
  }),
});

export const GrowerSchema = z.object({
  sellerId: z.string().openapi({ example: 'user-123' }),
  name: z.string().nullable().openapi({ example: 'Green Valley Farm' }),
  address: z.string().nullable().openapi({ example: '123 Farm Lane, Ruraltown' }),
  produceTypesOrdered: z.array(z.string()).openapi({ example: ['spinach', 'carrots'] }),
  amountOrderedThisMonthLbs: z.number().openapi({ example: 12.5 }),
  daysSinceFirstOrder: z.number().openapi({ example: 45 }),
  firstOrderDate: z.string().openapi({ example: '2023-10-01T12:00:00.000Z' }),
});

export const GrowersResponseSchema = z.array(GrowerSchema);

export const BillingSummaryResponseSchema = z.object({
  totalSpent: z.number().openapi({ example: 450.75, description: 'Lifetime total spent' }),
  totalProduceLbs: z
    .number()
    .openapi({ example: 60.5, description: 'Lifetime total produce ordered in pounds' }),
  avgCostPerLb: z
    .number()
    .openapi({ example: 7.45, description: 'Average cost per pound across all orders' }),
  localSourcingPercentage: z
    .number()
    .openapi({ example: 75.0, description: 'Percentage of orders from sellers in the same city' }),
});

export type GetGrowersQuery = z.infer<typeof GetGrowersQuerySchema>;
export type GrowerResponse = z.infer<typeof GrowerSchema>;
export type BillingSummaryResponse = z.infer<typeof BillingSummaryResponseSchema>;
