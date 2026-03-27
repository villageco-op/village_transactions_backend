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
  createdAt: z.union([z.string(), z.date()]).nullable(),
  updatedAt: z.union([z.string(), z.date()]).nullable(),
});

export const UpdateUserSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  deliveryRangeMiles: z.number().optional(),
});

export const WindowSchema = z.object({
  day: z.string(),
  start: z.string(),
  end: z.string(),
});

export const UpdateScheduleRulesSchema = z.object({
  pickupWindows: z.array(WindowSchema),
  deliveryWindows: z.array(WindowSchema),
});

export type UpdateScheduleRulesPayload = z.infer<typeof UpdateScheduleRulesSchema>;
export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
