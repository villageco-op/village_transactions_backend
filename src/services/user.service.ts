import { del } from '@vercel/blob';
import { HTTPException } from 'hono/http-exception';

import type { Organization, OrgRole, ScheduleType } from '../db/types.js';
import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { accountRepository } from '../repositories/account.repository.js';
import { fcmRepository } from '../repositories/fcm.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { produceRepository } from '../repositories/produce.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { scheduleRuleRepository } from '../repositories/schedule-rule.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import {
  transformUserProfile,
  type ReviewBreakdown,
  type UpdateScheduleRulesPayload,
  type UpdateUserPayload,
  type Window,
} from '../schemas/user.schema.js';

import {
  batchCancelAllPendingOrdersPlacedByUser,
  batchCancelPendingOrders,
} from './order.service.js';
import { batchCancelProductSubscriptions } from './subscription.service.js';

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

  return transformUserProfile(user);
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

  const dbPickupRules = data.pickupWindows.map((window: Window) => ({
    dayOfWeek: window.day,
    type: 'pickup' as ScheduleType,
    startTime: window.start,
    endTime: window.end,
  }));

  const dbDeliveryRules = data.deliveryWindows.map((window: Window) => ({
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

  let organization: Organization | null = null;
  if (user.organizationId) {
    organization = await organizationRepository.findById(user.organizationId);
  }

  return {
    id: user.id,
    name: user.name,
    image: user.image,
    organization: organization?.name || null,
    organizationId: user.organizationId,
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

/**
 * Anonymizes the user account and cleans up related active records
 * to preserve database FK integrity for past orders.
 * @param id - User's unique ID injected by Auth.js session
 * @param log - App logger that defaults to a blank logger
 */
export async function deleteAccount(id: string, log: AppLogger = noopLogger) {
  const currentUser = await userRepository.findById(id);

  if (!currentUser) {
    log.warn('Attempted to delete non-existent user profile');
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (currentUser.image) {
    del(currentUser.image).catch((err) => {
      log.error(
        { error: err instanceof Error ? err.message : err, blobUrl: currentUser.image },
        'Failed to delete orphaned blob image during account deletion',
      );
    });
  }

  await userRepository.anonymize(id);

  const sellerProducts = await produceRepository.findAllBySellerId(id);

  await produceRepository.markAllAsDeletedBySellerId(id);

  const reason = 'The seller closed their account.';
  for (const product of sellerProducts) {
    void Promise.allSettled([
      batchCancelProductSubscriptions(product.id, reason),
      batchCancelPendingOrders(product.id, reason, id, log),
    ]).catch((err) =>
      log.error({ err, productId: product.id }, 'Failed product cleanup for deleted account'),
    );
  }

  await batchCancelAllPendingOrdersPlacedByUser(id, 'User deleted their account', log);

  await scheduleRuleRepository.deleteBySellerId(id);

  await accountRepository.deleteByUserId(id);
  await sessionRepository.deleteByUserId(id);
  await fcmRepository.deleteByUserId(id);

  log.info('User account successfully anonymized and dependent records sanitized');
}

/**
 * Assigns an organization and role to a user.
 * @param userId - The ID of the user
 * @param organizationId - The ID of the organization
 * @param role - The role to assign
 * @param log - App logger that defaults to a blank logger
 * @returns The updated user
 */
export async function assignOrganizationToUser(
  userId: string,
  organizationId: string,
  role: OrgRole,
  log: AppLogger = noopLogger,
) {
  const updatedUser = await userRepository.updateOrgAndRole(userId, organizationId, role);

  if (!updatedUser) {
    log.warn({ userId, organizationId }, 'Attempted to assign organization to non-existent user');
    throw new HTTPException(404, { message: 'User not found' });
  }

  log.info({ userId, organizationId, role }, 'Successfully assigned organization and role to user');
  return updatedUser;
}

/**
 * Removes organization association (ID and role) from all users belonging to the given organization.
 * @param organizationId - The organization ID
 * @param log - App logger that defaults to a blank logger
 */
export async function removeOrganizationFromUsers(
  organizationId: string,
  log: AppLogger = noopLogger,
) {
  await userRepository.clearOrganizationFromUsers(organizationId);
  log.info(
    { organizationId },
    'Removed organization association and roles from all connected users',
  );
}

/**
 * Removes a user from their organization by clearing organizationId and orgRole.
 * @param userId - The ID of the user leaving the organization
 * @param log - App logger that defaults to a blank logger
 * @returns The updated user
 */
export async function leaveOrganization(userId: string, log: AppLogger = noopLogger) {
  const updatedUser = await userRepository.removeFromOrganization(userId);

  if (!updatedUser) {
    log.warn({ userId }, 'Attempted to leave organization for non-existent user');
    throw new HTTPException(404, { message: 'User not found' });
  }

  log.info({ userId }, 'Successfully removed user from organization');
  return updatedUser;
}
