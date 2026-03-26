import { z } from '@hono/zod-openapi';

export const CreateReviewSchema = z
  .object({
    sellerId: z.string().openapi({ description: 'The user ID of the seller' }),
    orderId: z.uuid().openapi({ description: 'The UUID of the completed order' }),
    rating: z.number().int().min(1).max(5).openapi({ description: 'Star rating from 1 to 5' }),
    comment: z.string().optional().openapi({ description: 'Optional review comment' }),
  })
  .openapi('CreateReview');

export type CreateReviewPayload = z.infer<typeof CreateReviewSchema>;
