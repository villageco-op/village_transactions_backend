import { HTTPException } from 'hono/http-exception';

import type { ScheduleType } from '../db/types.js';
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
 * @returns Sanitized user profile data
 */
export async function getCurrentUser(id: string) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return user;
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

  return updatedUser;
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

/**
 * Retrieves a sanitized public user profile, calculating review stats and active buyer metrics.
 * @param id - The requested user's ID
 * @returns Publicly viewable seller details and stats
 */
export async function getPublicUserProfile(id: string) {
  const user = await userRepository.findById(id);

  if (!user) {
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
    aboutMe: user.aboutMe,
    specialties: user.specialties,
    city: user.city,
    joinedAt: user.createdAt,
    starRating,
    totalReviews,
    reviewBreakdown,
    activeBuyerCount,
  };
}
