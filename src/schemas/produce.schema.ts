import { z } from '@hono/zod-openapi';

const ProduceFields = z.object({
  title: z.string().min(1).openapi({ example: 'Organic Honeycrisp Apples' }),
  produceType: z.string().optional().openapi({ example: 'fruit' }),
  pricePerOz: z.number().positive().openapi({ example: 0.25 }),
  totalOzInventory: z.number().nonnegative().openapi({ example: 500 }),
  harvestFrequencyDays: z.number().int().nonnegative().openapi({ example: 7 }),
  seasonStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .openapi({ example: '2024-09-01' }),
  seasonEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .openapi({ example: '2024-11-30' }),
  images: z.array(z.url()).openapi({ example: ['https://example.com/apple.jpg'] }),
  isSubscribable: z.boolean().openapi({ example: true }),
});

export const CreateProduceSchema = ProduceFields.extend({
  images: ProduceFields.shape.images.default([]),
  isSubscribable: ProduceFields.shape.isSubscribable.default(false),
});

export const UpdateProduceSchema = ProduceFields.partial()
  .extend({
    status: z.enum(['active', 'paused', 'deleted']).optional().openapi({ example: 'paused' }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export type CreateProducePayload = z.infer<typeof CreateProduceSchema>;
export type UpdateProducePayload = z.infer<typeof UpdateProduceSchema>;
