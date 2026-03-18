import { z } from '@hono/zod-openapi';

export const ProduceSchema = z.object({
  id: z.uuid(),
  sellerId: z.string(),
  title: z.string(),
  produceType: z.string().nullable(),
  pricePerOz: z.string(),
  totalOzInventory: z.string(),
  harvestFrequencyDays: z.number().int(),
  seasonStart: z.string(),
  seasonEnd: z.string(),
  images: z.array(z.url()).nullable(),
  isSubscribable: z.boolean().nullable(),
  status: z.enum(['active', 'paused', 'deleted']).nullable(),
  createdAt: z.union([z.string(), z.date()]).nullable(),
  updatedAt: z.union([z.string(), z.date()]).nullable(),
});

export const CreateProduceSchema = z.object({
  title: z.string().min(1, 'Title is required').openapi({ example: 'Organic Honeycrisp Apples' }),
  produceType: z.string().optional().openapi({ example: 'fruit' }),
  pricePerOz: z.number().positive().openapi({ example: 0.25 }),
  totalOzInventory: z.number().nonnegative().openapi({ example: 500 }),
  harvestFrequencyDays: z.number().int().nonnegative().openapi({ example: 7 }),
  seasonStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .openapi({ example: '2024-09-01' }),
  seasonEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .openapi({ example: '2024-11-30' }),
  images: z
    .array(z.string().url())
    .default([])
    .openapi({ example: ['https://example.com/apple.jpg'] }),
  isSubscribable: z.boolean().default(false).openapi({ example: true }),
});

export type CreateProducePayload = z.infer<typeof CreateProduceSchema>;
