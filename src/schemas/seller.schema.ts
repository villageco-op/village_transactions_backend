import { z } from '@hono/zod-openapi';

export const GetSellerPayoutsQuerySchema = z.object({
  timeframe: z
    .string()
    .optional()
    .default('90days')
    .openapi({
      param: {
        name: 'timeframe',
        in: 'query',
      },
      example: '90days',
      description: 'The period for which to fetch payout history.',
    }),
});

export const PayoutSchema = z.object({
  date: z.string().openapi({
    example: '2024-03-24T14:30:00Z',
    description: 'ISO 8601 timestamp of the payout/transfer',
  }),
  buyerName: z.string().openapi({
    example: 'John Doe',
    description: 'Name of the buyer associated with this transaction',
  }),
  productName: z.string().openapi({
    example: 'Organic Honey crisp Apples',
    description: 'Name of the product sold',
  }),
  quantityLbs: z.number().openapi({
    example: 15.5,
    description: 'The quantity sold in pounds (lbs)',
  }),
  amountDollars: z.number().openapi({
    example: 45.0,
    description: 'The payout amount in USD',
  }),
});

export const PayoutHistorySchema = z.array(PayoutSchema).openapi('PayoutHistory');

export const ProduceSalesSchema = z.object({
  produceName: z.string().openapi({ example: 'Organic Apples' }),
  amount: z.number().openapi({ example: 150.75, description: 'Amount sold in dollars this month' }),
});

export const SellerEarningsResponseSchema = z.object({
  earnedThisMonth: z.number().openapi({ example: 1200.5 }),
  earnedLastMonth: z.number().openapi({ example: 980.0 }),
  remainingToGoal: z.number().openapi({ example: 299.5 }),
  monthlyGoal: z.number().openapi({ example: 1500.0 }),
  totalEarnedYTD: z.number().openapi({ example: 5400.25 }),
  ytdStartDate: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
  avgPerLbSold: z.number().openapi({ example: 4.5 }),
  amountSoldDollarsPerProduceThisMonth: z.array(ProduceSalesSchema),
});

export const LocationSchema = z.object({
  lat: z.number().nullable().openapi({ example: 37.7749 }),
  lng: z.number().nullable().openapi({ example: -122.4194 }),
  address: z.string().nullable().openapi({ example: '123 Farm Lane, Springfield' }),
});

export const EarningsByProduceSchema = z.object({
  produceName: z.string().openapi({ example: 'Tomatoes' }),
  earned: z.number().openapi({ example: 50.0 }),
});

export const SellerDashboardResponseSchema = z.object({
  earnedThisMonth: z.number().openapi({ example: 450.0 }),
  earnedLastMonth: z.number().openapi({ example: 320.0 }),
  soldThisWeekLbs: z.number().openapi({ example: 12.5 }),
  onTrackWithGoal: z.boolean().openapi({ example: true }),
  monthlyGoal: z.number().openapi({ example: 1000.0 }),
  activeListingsCount: z.number().openapi({ example: 2 }),
  activeListingsNames: z.array(z.string()).openapi({ example: ['Tomatoes', 'Corn'] }),
  earningsByProduceThisMonth: z.array(EarningsByProduceSchema),
  sellerLocation: LocationSchema,
});

export type SellerEarningsResponse = z.infer<typeof SellerEarningsResponseSchema>;
export type GetSellerPayoutsQuery = z.infer<typeof GetSellerPayoutsQuerySchema>;
export type Payout = z.infer<typeof PayoutSchema>;
export type SellerDashboardResponse = z.infer<typeof SellerDashboardResponseSchema>;
