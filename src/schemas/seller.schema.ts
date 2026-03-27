import { z } from '@hono/zod-openapi';

import { AddressSchema, IsoDateTimeSchema, PriceDollarsSchema } from './common.schema.js';

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
  date: IsoDateTimeSchema,
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
  amountDollars: PriceDollarsSchema,
});

export const PayoutHistorySchema = z.array(PayoutSchema).openapi('PayoutHistory');

export const ProduceSalesSchema = z.object({
  produceName: z.string().openapi({ example: 'Organic Apples' }),
  amount: PriceDollarsSchema,
});

export const SellerEarningsResponseSchema = z
  .object({
    earnedThisMonth: PriceDollarsSchema,
    earnedLastMonth: PriceDollarsSchema,
    remainingToGoal: PriceDollarsSchema,
    monthlyGoal: PriceDollarsSchema,
    totalEarnedYTD: PriceDollarsSchema,
    ytdStartDate: IsoDateTimeSchema,
    avgPerLbSold: z.number().openapi({
      example: 4.5,
      description: 'Average revenue generated per pound of produce sold',
    }),
    amountSoldDollarsPerProduceThisMonth: z.array(ProduceSalesSchema).openapi({
      description: 'Breakdown of sales revenue by individual produce type',
    }),
  })
  .openapi('SellerEarningsResponse');

export const LocationSchema = z.object({
  lat: z.number().nullable().openapi({ example: 37.7749 }),
  lng: z.number().nullable().openapi({ example: -122.4194 }),
  address: AddressSchema.nullable(),
});

export const EarningsByProduceSchema = z.object({
  produceName: z.string().openapi({ example: 'Tomatoes' }),
  earned: z
    .number()
    .openapi({ example: 50.0, description: 'Total dollars earned for this produce item' }),
});

export const SellerDashboardResponseSchema = z
  .object({
    earnedThisMonth: z.number().openapi({ example: 450.0 }),
    earnedLastMonth: z.number().openapi({ example: 320.0 }),
    soldThisWeekLbs: z.number().openapi({ example: 12.5 }),
    onTrackWithGoal: z.boolean().openapi({
      example: true,
      description: 'Calculated status indicating if the seller is likely to hit their monthly goal',
    }),
    monthlyGoal: z.number().openapi({ example: 1000.0 }),
    activeListingsCount: z.number().openapi({ example: 2 }),
    activeListingsNames: z.array(z.string()).openapi({ example: ['Tomatoes', 'Corn'] }),
    earningsByProduceThisMonth: z.array(EarningsByProduceSchema),
    sellerLocation: LocationSchema,
  })
  .openapi('SellerDashboardResponse');

export type SellerEarningsResponse = z.infer<typeof SellerEarningsResponseSchema>;
export type GetSellerPayoutsQuery = z.infer<typeof GetSellerPayoutsQuerySchema>;
export type Payout = z.infer<typeof PayoutSchema>;
export type SellerDashboardResponse = z.infer<typeof SellerDashboardResponseSchema>;
