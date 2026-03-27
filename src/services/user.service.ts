import { HTTPException } from 'hono/http-exception';

import type { ScheduleType } from '../db/types.js';
import { scheduleRuleRepository } from '../repositories/schedule-rule.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { UpdateScheduleRulesPayload, UpdateUserPayload } from '../schemas/user.schema.js';

/**
 * Retrieves the current user profile, handles missing users, and sanitizes data.
 * @param id - User's unique ID injected by Auth.js session
 * @returns Sanitized user profile data
 */
export async function getCurrentUser(id: string) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;

  return safeUser;
}

/**
 * Updates the current user profile with new information.
 * @param id - User's unique ID injected by Auth.js session
 * @param data - The new profile data payload from the request body
 * @returns Sanitized updated user profile data
 */
export async function updateCurrentUser(id: string, data: UpdateUserPayload) {
  const updatedUser = await userRepository.updateById(id, data);

  if (!updatedUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const { passwordHash: _passwordHash, ...safeUser } = updatedUser;

  return safeUser;
}

/**
 * Registers a Firebase Cloud Messaging token for the user's current device.
 * @param id - User's unique ID
 * @param token - FCM token
 * @param platform - Device platform identifier (e.g. 'ios', 'android', 'web')
 */
export async function registerFcmToken(id: string, token: string, platform: string) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  await userRepository.updateFcmToken(id, token, platform);
}

/**
 * INTERNAL USE ONLY: Updates the user's Stripe Account ID.
 * @param id - User's unique ID
 * @param stripeAccountId - The generated Stripe Account ID
 * @returns The updated user object
 */
export async function updateInternalStripeAccountId(id: string, stripeAccountId: string) {
  const updatedUser = await userRepository.updateStripeAccountId(id, stripeAccountId);

  if (!updatedUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return updatedUser;
}

/**
 * Updates a seller's weekly base schedule rules.
 * @param id - User's (Seller's) unique ID
 * @param data - The new schedule array payload
 */
export async function updateScheduleRules(id: string, data: UpdateScheduleRulesPayload) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const dbPickupRules = data.pickupWindows.map((window) => ({
    dayOfWeek: window.day,
    type: 'pickup' as ScheduleType,
    startTime: window.start,
    endTime: window.end,
  }));

  const dbDeliveryRules = data.deliveryWindows.map((window) => ({
    dayOfWeek: window.day,
    type: 'delivery' as ScheduleType,
    startTime: window.start,
    endTime: window.end,
  }));

  await scheduleRuleRepository.replaceSellerRules(id, [...dbPickupRules, ...dbDeliveryRules]);
}
