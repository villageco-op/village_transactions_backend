import { z } from '@hono/zod-openapi';

export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  emailVerified: z.union([z.string(), z.date()]).nullable(),
  image: z.string().nullable(),
  address: z.string().nullable(),
  location: z.any().nullable().describe('Geography(Point, 4326) exact lat/lng'),
  deliveryRangeMiles: z.string().nullable(),
  stripeAccountId: z.string().nullable(),
  stripeOnboardingComplete: z.boolean().nullable(),
});
