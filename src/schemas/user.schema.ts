import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { users } from '../db/schema.js';

import { LatitudeSchema, LongitudeSchema, PriceDollarsSchema } from './common.schema.js';

const BaseProfileSchema = createSelectSchema(users).omit({
  location: true,
  stripeAccountId: true,
});

export const UserProfileSchema = BaseProfileSchema.extend({
  isOnboardingComplete: z.boolean(),
}).openapi('User');

/**
 * Adds the computed field (isOnboardingComplete) to the user object.
 * @param user - The user database object
 * @returns The user with the isOnboardingComplete field
 */
export function transformUserProfile(user: typeof users.$inferSelect) {
  return {
    ...user,
    isOnboardingComplete: Boolean(
      user.name && user.address && user.city && user.state && user.country && user.zip,
    ),
  };
}

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
    address: z.string().optional().openapi({ example: '123 West st.' }),
    city: z.string().optional().openapi({ example: 'Madison' }),
    state: z.string().optional().openapi({ example: 'WI' }),
    country: z.string().optional().openapi({ example: 'United States of America' }),
    zip: z.string().optional().openapi({ example: '54751' }),
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

export const UnregisterFcmTokenSchema = z
  .object({
    platform: z.enum(['ios', 'android', 'web']).openapi({
      example: 'ios',
      description: 'The operating system of the device unregistering the token',
    }),
  })
  .openapi('UnregisterFcmTokenPayload');

export const GetFcmStatusQuerySchema = z
  .object({
    platform: z.enum(['ios', 'android', 'web']).openapi({
      example: 'ios',
      description: 'The operating system of the device',
    }),
  })
  .openapi('GetFcmStatusQuery');

export const FcmStatusResponseSchema = z
  .object({
    status: z.boolean(),
  })
  .openapi('FcmStatusResponse');

export type RegisterFcmTokenPayload = z.infer<typeof RegisterFcmTokenSchema>;
export type UnregisterFcmTokenPayload = z.infer<typeof UnregisterFcmTokenSchema>;
export type GetFcmStatusQuery = z.infer<typeof GetFcmStatusQuerySchema>;
export type UpdateScheduleRulesPayload = z.infer<typeof UpdateScheduleRulesSchema>;
export type Window = z.infer<typeof WindowSchema>;
export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
