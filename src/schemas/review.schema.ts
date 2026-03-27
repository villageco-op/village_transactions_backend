import { z } from '@hono/zod-openapi';

export const CreateReviewSchema = z
  .object({
    sellerId: z.string().openapi({ description: 'The user ID of the seller' }),
    orderId: z.uuid().openapi({ description: 'The UUID of the completed order' }),
    rating: z.number().int().min(1).max(5).openapi({ description: 'Star rating from 1 to 5' }),
    comment: z.string().optional().openapi({ description: 'Optional review comment' }),
  })
  .openapi('CreateReview');

export const GetSellerReviewsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .openapi({ description: 'Page number' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .openapi({ description: 'Items per page' }),
  sortBy: z
    .enum(['createdAt', 'rating'])
    .optional()
    .default('createdAt')
    .openapi({ description: 'Sort field' }),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .openapi({ description: 'Sort direction' }),
});

export type GetSellerReviewsQuery = z.infer<typeof GetSellerReviewsQuerySchema>;

export const ReviewBuyerSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});

export const SellerReviewItemSchema = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string(),
  buyer: ReviewBuyerSchema.nullable(),
});

export const PaginatedReviewsResponseSchema = z.object({
  reviews: z.array(SellerReviewItemSchema),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

export type CreateReviewPayload = z.infer<typeof CreateReviewSchema>;
