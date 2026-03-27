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

export type GetSellerPayoutsQuery = z.infer<typeof GetSellerPayoutsQuerySchema>;
export type Payout = z.infer<typeof PayoutSchema>;
