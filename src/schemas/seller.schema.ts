import { z } from '@hono/zod-openapi';

import {
  IsoDateTimeSchema,
  LocationSchema,
  PaginationQuerySchema,
  PriceDollarsSchema,
} from './common.schema.js';
import { createPaginatedResponseSchema } from './util/pagination.js';

export const GetSellerPayoutsQuerySchema = z
  .object({
    timeframe: z.string().optional().default('90days').openapi({
      example: '90days',
      description: 'The period for which to fetch payout history.',
    }),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('GetSellerPayoutsQuery');

export const PayoutSchema = z
  .object({
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
  })
  .openapi('Payout');

export const PayoutHistoryResponseSchema = createPaginatedResponseSchema(
  PayoutSchema,
  'PayoutHistoryResponse',
);

export const ProduceAmountSchema = z
  .object({
    produceName: z.string().openapi({ example: 'Organic Apples' }),
    amount: PriceDollarsSchema,
  })
  .openapi('ProduceAmount');

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
    amountSoldDollarsPerProduceThisMonth: z.array(ProduceAmountSchema).openapi({
      description: 'Breakdown of sales revenue by individual produce name',
    }),
  })
  .openapi('SellerEarningsResponse');

export const SellerDashboardResponseSchema = z
  .object({
    earnedThisMonth: z.number().openapi({ example: 450.0 }),
    onTrackWithGoal: z.boolean().openapi({
      example: true,
      description: 'Calculated status indicating if the seller is likely to hit their monthly goal',
    }),
    monthlyGoal: z.number().openapi({ example: 1000.0 }),
    completedOrdersThisMonth: z.number().openapi({ example: 2 }),
    pendingOrders: z.number().openapi({ example: 2 }),
    activeSubscriptions: z.number().openapi({ example: 2 }),
    earningsByProduceThisMonth: z.array(ProduceAmountSchema),
    sellerLocation: LocationSchema,
  })
  .openapi('SellerDashboardResponse');

export type SellerEarningsResponse = z.infer<typeof SellerEarningsResponseSchema>;
export type GetSellerPayoutsQuery = z.infer<typeof GetSellerPayoutsQuerySchema>;
export type Payout = z.infer<typeof PayoutSchema>;
export type SellerDashboardResponse = z.infer<typeof SellerDashboardResponseSchema>;
