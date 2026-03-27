import { z } from '@hono/zod-openapi';

import {
  AddressSchema,
  IsoDateTimeSchema,
  PriceDollarsSchema,
  ResourceIdSchema,
  UserIdSchema,
} from './common.schema.js';

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
  sellerId: UserIdSchema,
  name: z.string().nullable().openapi({
    example: 'Green Valley Farm',
    description: 'The display name of the grower',
  }),
  address: AddressSchema.nullable(),
  produceTypesOrdered: z.array(z.string()).openapi({
    example: ['spinach', 'carrots'],
    description: 'List of produce categories previously purchased from this grower',
  }),
  amountOrderedThisMonthLbs: z.number().openapi({
    example: 12.5,
    description: 'Total weight of produce ordered from this grower in the current month',
  }),
  daysSinceFirstOrder: z.number().openapi({
    example: 45,
    description: 'Number of days since the first transaction with this grower',
  }),
  firstOrderDate: IsoDateTimeSchema,
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

export const ActiveSubscriptionSchema = z.object({
  id: ResourceIdSchema,
  produceName: z.string().openapi({
    example: 'Organic Apples',
    description: 'Name of the recurring produce item',
  }),
  amount: z.number().openapi({ example: 10.5, description: 'Subscription amount in Lbs' }),
});

export const BuyerDashboardResponseSchema = z.object({
  onOrderThisWeekLbs: z.number().openapi({
    example: 25.4,
    description: 'Total weight of produce scheduled for delivery this week',
  }),
  percentChangeFromLastWeek: z.number().openapi({
    example: 12.5,
    description: 'Percentage change in order volume compared to the previous week',
  }),
  totalSpendThisMonth: PriceDollarsSchema,
  totalSpendLastMonth: PriceDollarsSchema,
  activeSubscriptions: z.array(ActiveSubscriptionSchema).openapi({
    description: 'List of currently active recurring orders',
  }),
  localGrowersSupplying: z.number().openapi({
    example: 3,
    description: 'Count of local growers currently fulfilling orders',
  }),
  furthestGrowerDistanceMiles: z.number().openapi({
    example: 45.2,
    description: 'Distance in miles to the most distant supplier',
  }),
  avgGrowerDistanceMiles: z.number().openapi({
    example: 18.4,
    description: 'Mean distance in miles across all active suppliers',
  }),
});

export type GetGrowersQuery = z.infer<typeof GetGrowersQuerySchema>;
export type GrowerResponse = z.infer<typeof GrowerSchema>;
export type BillingSummaryResponse = z.infer<typeof BillingSummaryResponseSchema>;
export type ActiveSubscriptionResponse = z.infer<typeof ActiveSubscriptionSchema>;
export type BuyerDashboardResponse = z.infer<typeof BuyerDashboardResponseSchema>;
