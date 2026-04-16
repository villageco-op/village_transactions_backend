import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { users } from '../db/schema.js';

import {
  AddressSchema,
  ImageUrlSchema,
  LatitudeSchema,
  LongitudeSchema,
  PriceDollarsSchema,
  UserIdSchema,
} from './common.schema.js';

export const UserProfileSchema = createSelectSchema(users).omit({ location: true }).openapi('User');

export const UpdateUserSchema = z
  .object({
    name: z.string().optional().openapi({
      example: 'Alex Farmer',
      description: 'The user’s display name',
    }),
    image: z.url().optional().openapi({
      example: 'https://blob.vercel.com/image.png',
      description: 'The url to the image in vercel blob from the upload image response.',
    }),
    aboutMe: z.string().optional().openapi({
      example: 'Growing organic berries since 2010.',
      description: 'A brief bio or description of the farm/user',
    }),
    specialties: z
      .array(z.string())
      .optional()
      .openapi({
        example: ['Berries', 'Root Vegetables'],
        description: 'List of product categories the user specializes in',
      }),
    goal: PriceDollarsSchema.optional().openapi({
      description: 'The monthly earnings goal for the seller',
    }),
    address: AddressSchema.optional(),
    city: z.string().optional().openapi({ example: 'Madison' }),
    lat: LatitudeSchema.optional(),
    lng: LongitudeSchema.optional(),
    deliveryRangeMiles: z.number().optional().openapi({
      example: 25,
      description: 'Maximum distance the seller is willing to travel for deliveries',
    }),
  })
  .openapi('UpdateUserPayload');

export const WindowSchema = z
  .object({
    day: z.string().openapi({
      example: 'Monday',
      description: 'The day of the week for this availability window',
    }),
    start: z.string().openapi({
      example: '09:00',
      description: 'Opening time in 24-hour format (HH:mm)',
    }),
    end: z.string().openapi({
      example: '17:00',
      description: 'Closing time in 24-hour format (HH:mm)',
    }),
  })
  .openapi('AvailabilityWindow');

export const UpdateScheduleRulesSchema = z
  .object({
    pickupWindows: z.array(WindowSchema).openapi({
      description: 'Set of time windows when buyers can pick up orders',
    }),
    deliveryWindows: z.array(WindowSchema).openapi({
      description: 'Set of time windows when the seller performs deliveries',
    }),
  })
  .openapi('UpdateScheduleRulesPayload');

export const PublicUserProfileSchema = z
  .object({
    id: UserIdSchema,
    name: z.string().nullable().openapi({ example: 'Green Acres' }),
    image: ImageUrlSchema.nullable(),
    aboutMe: z.string().nullable().openapi({
      description: 'Public bio displayed on the seller storefront',
    }),
    specialties: z
      .array(z.string())
      .nullable()
      .openapi({
        example: ['spinach', 'carrots'],
        description: 'List of produce the seller specializes in.',
      }),
    city: z.string().nullable().openapi({ example: 'Madison, WI' }),
    joinedAt: z.union([z.string(), z.date()]).nullable().openapi({
      description: 'Timestamp of when the user first registered',
    }),
    starRating: z.number().openapi({
      example: 4.8,
      description: 'Weighted average of all received reviews',
    }),
    totalReviews: z.number().openapi({ example: 124 }),
    reviewBreakdown: z
      .object({
        '1': z.number(),
        '2': z.number(),
        '3': z.number(),
        '4': z.number(),
        '5': z.number(),
      })
      .openapi('ReviewBreakdown', { description: 'Count of reviews for each star level' }),
    activeBuyerCount: z.number().openapi({
      example: 12,
      description: 'Number of unique customers who have ordered recently',
    }),
  })
  .openapi('PublicUserProfile');

export const RegisterFcmTokenSchema = z
  .object({
    token: z.string().openapi({
      example: 'bk3RNwTe3H0:CI2k_HHwgIpoDKCIZjt4Z6...',
      description: 'The unique Firebase Cloud Messaging token for the device',
    }),
    platform: z.enum(['ios', 'android', 'web']).openapi({
      example: 'ios',
      description: 'The operating system of the device registering the token',
    }),
  })
  .openapi('RegisterFcmTokenPayload');

export type RegisterFcmTokenPayload = z.infer<typeof RegisterFcmTokenSchema>;
export type UpdateScheduleRulesPayload = z.infer<typeof UpdateScheduleRulesSchema>;
export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
export type PublicUserProfile = z.infer<typeof PublicUserProfileSchema>;
export type ReviewBreakdown = PublicUserProfile['reviewBreakdown'];
