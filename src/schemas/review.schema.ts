import { z } from '@hono/zod-openapi';

import {
  ImageUrlSchema,
  IsoDateTimeSchema,
  PaginationMetadataSchema,
  ResourceIdSchema,
  UserIdSchema,
} from './common.schema.js';

export const CreateReviewSchema = z
  .object({
    sellerId: UserIdSchema,
    orderId: ResourceIdSchema,
    rating: z.number().int().min(1).max(5).openapi({
      example: 5,
      description: 'Star rating from 1 to 5',
    }),
    comment: z.string().optional().openapi({
      example: 'The apples were incredibly crisp and sweet!',
      description: 'Optional text review from the buyer',
    }),
  })
  .openapi('CreateReviewPayload');

export const GetSellerReviewsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .openapi({ example: 1, description: 'The page number for pagination' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .openapi({ example: 10, description: 'Number of reviews to return per page' }),
  sortBy: z
    .enum(['createdAt', 'rating'])
    .optional()
    .default('createdAt')
    .openapi({ example: 'createdAt', description: 'The field used to sort reviews' }),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .openapi({ example: 'desc', description: 'The direction of the sort' }),
});

export type GetSellerReviewsQuery = z.infer<typeof GetSellerReviewsQuerySchema>;

export const ReviewBuyerSchema = z
  .object({
    id: UserIdSchema,
    name: z.string().nullable().openapi({ example: 'Alex River' }),
    image: ImageUrlSchema.nullable(),
  })
  .openapi('ReviewBuyer');

export const SellerReviewItemSchema = z
  .object({
    id: ResourceIdSchema,
    rating: z.number().openapi({ example: 4 }),
    comment: z.string().nullable().openapi({ example: 'Great produce, slightly late delivery.' }),
    createdAt: IsoDateTimeSchema,
    buyer: ReviewBuyerSchema.nullable(),
  })
  .openapi('SellerReviewItem');

export const PaginatedReviewsResponseSchema = z
  .object({
    reviews: z
      .array(SellerReviewItemSchema)
      .openapi({ description: 'List of reviews for the seller' }),
    pagination: PaginationMetadataSchema,
  })
  .openapi('PaginatedReviewsResponse');

export type CreateReviewPayload = z.infer<typeof CreateReviewSchema>;
