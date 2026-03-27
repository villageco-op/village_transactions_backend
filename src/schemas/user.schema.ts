import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { users } from '../db/schema.js';

export const UserProfileSchema = createSelectSchema(users)
  .omit({ passwordHash: true })
  .openapi('User');

export const UpdateUserSchema = z.object({
  name: z.string().optional(),
  aboutMe: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  goal: z.number().optional(),
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
