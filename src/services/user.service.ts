import { del } from '@vercel/blob';
import { HTTPException } from 'hono/http-exception';

import type { ScheduleType } from '../db/types.js';
import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { orderRepository } from '../repositories/order.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { scheduleRuleRepository } from '../repositories/schedule-rule.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type {
  ReviewBreakdown,
  UpdateScheduleRulesPayload,
  UpdateUserPayload,
} from '../schemas/user.schema.js';

/**
 * Retrieves the current user profile, handles missing users, and sanitizes data.
 * @param id - User's unique ID injected by Auth.js session
 * @param log - App logger that defaults to a blank logger
 * @returns Sanitized user profile data
 */
export async function getCurrentUser(id: string, log: AppLogger = noopLogger) {
  const user = await userRepository.findById(id);

  if (!user) {
    log.warn('Authenticated user not found in database');
    throw new HTTPException(404, { message: 'User not found' });
  }

  return user;
}

/**
 * Updates the current user profile with new information.
 * Deletes the current profile image if replaced.
 * @param id - User's unique ID injected by Auth.js session
 * @param data - The new profile data payload from the request body
 * @param log - App logger that defaults to a blank logger
 * @returns Sanitized updated user profile data
 */
export async function updateCurrentUser(
  id: string,
  data: UpdateUserPayload,
  log: AppLogger = noopLogger,
) {
  const currentUser = await userRepository.findById(id);

  if (!currentUser) {
    log.warn('Attempted to update non-existent user profile');
    throw new HTTPException(404, { message: 'User not found' });
  }

  const oldImageUrl = currentUser.image;
  const newImageUrl = data.image;

  const updatedUser = await userRepository.updateById(id, data);
  log.info('User profile details updated successfully');

  if (newImageUrl && oldImageUrl && oldImageUrl !== newImageUrl) {
    del(oldImageUrl).catch((err) => {
      log.error(
        { error: err instanceof Error ? err.message : err, blobUrl: oldImageUrl },
        'Failed to delete orphaned blob image',
      );
    });
  }

  return updatedUser;
}

/**
 * INTERNAL USE ONLY: Updates the user's Stripe Account ID.
 * @param id - User's unique ID
 * @param stripeAccountId - The generated Stripe Account ID
 * @param log - App logger that defaults to a blank logger
 * @returns The updated user object
 */
export async function updateInternalStripeAccountId(
  id: string,
  stripeAccountId: string,
  log: AppLogger = noopLogger,
) {
  const updatedUser = await userRepository.updateStripeAccountId(id, stripeAccountId);

  if (!updatedUser) {
    log.warn('Attempted to link Stripe account to non-existent user');
    throw new HTTPException(404, { message: 'User not found' });
  }

  log.info({ stripeAccountId }, 'Successfully linked Stripe account ID to user');
  return updatedUser;
}

/**
 * Updates a seller's weekly base schedule rules.
 * @param id - User's (Seller's) unique ID
 * @param data - The new schedule array payload
 * @param log - App logger that defaults to a blank logger
 */
export async function updateScheduleRules(
  id: string,
  data: UpdateScheduleRulesPayload,
  log: AppLogger = noopLogger,
) {
  const user = await userRepository.findById(id);

  if (!user) {
    log.warn('Attempted to update schedule for non-existent user');
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

  log.info(
    { pickupCount: dbPickupRules.length, deliveryCount: dbDeliveryRules.length },
    'Replaced seller schedule rules',
  );
}

/**
 * Retrieves a sanitized public user profile, calculating review stats and active buyer metrics.
 * @param id - The requested user's ID
 * @param log - App logger that defaults to a blank logger
 * @returns Publicly viewable seller details and stats
 */
export async function getPublicUserProfile(id: string, log: AppLogger = noopLogger) {
  const user = await userRepository.findById(id);

  if (!user) {
    log.warn('Requested public profile not found');
    throw new HTTPException(404, { message: 'User not found' });
  }

  const reviewStats = await reviewRepository.getReviewStatsBySellerId(id);

  let totalReviews = 0;
  let totalStars = 0;
  const reviewBreakdown: ReviewBreakdown = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };

  for (const stat of reviewStats) {
    const ratingStr = String(stat.rating);
    if (ratingStr in reviewBreakdown) {
      const key = ratingStr as keyof ReviewBreakdown;
      reviewBreakdown[key] = stat.count;
    }
    totalReviews += stat.count;
    totalStars += stat.rating * stat.count;
  }

  const starRating = totalReviews > 0 ? Number((totalStars / totalReviews).toFixed(1)) : 0;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeBuyerCount = await orderRepository.getActiveBuyerCount(id, startOfMonth);

  return {
    id: user.id,
    name: user.name,
    image: user.image,
    organization: user.organization,
    aboutMe: user.aboutMe,
    specialties: user.specialties,
    country: user.country,
    state: user.state,
    city: user.city,
    joinedAt: user.createdAt,
    starRating,
    totalReviews,
    reviewBreakdown,
    activeBuyerCount,
  };
}
