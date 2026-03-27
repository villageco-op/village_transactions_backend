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
  city: z.string().optional(),
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

export const PublicUserProfileSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    aboutMe: z.string().nullable(),
    specialties: z.array(z.string()).nullable(),
    city: z.string().nullable(),
    joinedAt: z.union([z.string(), z.date()]).nullable(),
    starRating: z.number(),
    totalReviews: z.number(),
    reviewBreakdown: z.object({
      '1': z.number(),
      '2': z.number(),
      '3': z.number(),
      '4': z.number(),
      '5': z.number(),
    }),
    activeBuyerCount: z.number(),
  })
  .openapi('PublicUserProfile');

export type UpdateScheduleRulesPayload = z.infer<typeof UpdateScheduleRulesSchema>;
export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>;
export type ReviewBreakdown = PublicUserProfile['reviewBreakdown'];
