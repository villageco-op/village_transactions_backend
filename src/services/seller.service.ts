import { HTTPException } from 'hono/http-exception';

import type { Organization } from '../db/types.js';
import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { orderRepository } from '../repositories/order.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { reviewRepository } from '../repositories/review.repository.js';
import { sellerRepository } from '../repositories/seller.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type {
  SellerDashboardResponse,
  SellerEarningsResponse,
  ReviewBreakdown,
} from '../schemas/seller.schema.js';

/**
 * Calculates earnings metrics and formats them for the seller earnings page.
 * @param sellerId - The ID of the seller
 * @returns Earnings metrics structure
 */
export async function getSellerEarningsMetrics(sellerId: string): Promise<SellerEarningsResponse> {
  const data = await sellerRepository.getEarningsMetrics(sellerId);

  const earnedThisMonth = Number(data.aggregates?.earnedThisMonth || 0);
  const earnedLastMonth = Number(data.aggregates?.earnedLastMonth || 0);
  const totalEarnedYTD = Number(data.aggregates?.totalEarnedYTD || 0);
  const monthlyGoal = Number(data.goal || 0);
  const remainingToGoal = Math.max(0, monthlyGoal - earnedThisMonth);

  const totalEarnedLifetime = Number(data.aggregates?.totalEarnedLifetime || 0);
  const totalLbsLifetime = Number(data.weightAgg?.totalOzLifetime || 0) / 16;
  const avgPerLbSold = totalLbsLifetime > 0 ? totalEarnedLifetime / totalLbsLifetime : 0;

  const now = new Date();
  const ytdStartDate = new Date(now.getFullYear(), 0, 1).toISOString();

  const amountSoldDollarsPerProduceThisMonth = data.produceSalesThisMonth.map((item) => ({
    produceName: item.produceName || 'Unknown',
    amount: Number(Number(item.amount || 0).toFixed(2)),
  }));

  return {
    earnedThisMonth: Number(earnedThisMonth.toFixed(2)),
    earnedLastMonth: Number(earnedLastMonth.toFixed(2)),
    remainingToGoal: Number(remainingToGoal.toFixed(2)),
    monthlyGoal: Number(monthlyGoal.toFixed(2)),
    totalEarnedYTD: Number(totalEarnedYTD.toFixed(2)),
    ytdStartDate,
    avgPerLbSold: Number(avgPerLbSold.toFixed(2)),
    amountSoldDollarsPerProduceThisMonth,
  };
}

/**
 * Formats data for the high-level seller dashboard.
 * Calculates track-rate towards the monthly goal to determine if the seller is currently on track.
 * Fetches data concurrently from respective repositories.
 * @param sellerId The ID of the seller
 * @returns Formatted dashboard response object
 */
export async function getSellerDashboard(sellerId: string): Promise<SellerDashboardResponse> {
  const [data, pendingOrders, activeSubs] = await Promise.all([
    sellerRepository.getDashboardMetrics(sellerId),
    orderRepository.getPendingOrdersBySellerId(sellerId),
    subscriptionRepository.getActiveSubscriptionsForSeller(sellerId),
  ]);

  const earnedThisMonth = Number(data.aggregates?.earnedThisMonth || 0);
  const completedOrdersThisMonth = Number(data.aggregates?.completedOrdersThisMonth || 0);

  const monthlyGoal = Number(data.seller?.goal || 0);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const expectedProratedGoal = (monthlyGoal / daysInMonth) * currentDay;

  const onTrackWithGoal = monthlyGoal > 0 ? earnedThisMonth >= expectedProratedGoal : true;

  const earningsByProduceThisMonth = data.produceSalesThisMonth.map((item) => ({
    produceName: item.produceName || 'Unknown',
    amount: Number(Number(item.amount || 0).toFixed(2)),
  }));

  return {
    earnedThisMonth: Number(earnedThisMonth.toFixed(2)),
    onTrackWithGoal,
    monthlyGoal: Number(monthlyGoal.toFixed(2)),
    completedOrdersThisMonth,
    pendingOrders: pendingOrders.length,
    activeSubscriptions: activeSubs.length,
    earningsByProduceThisMonth,
    sellerLocation: {
      lat: data.seller?.lat ?? null,
      lng: data.seller?.lng ?? null,
      address: data.seller?.address ?? null,
      city: data.seller?.city ?? null,
      state: data.seller?.state ?? null,
      country: data.seller?.country ?? null,
      zip: data.seller?.zip ?? null,
    },
  };
}

/**
 * Retrieves a sanitized public seller profile, calculating review stats and active buyer metrics.
 * @param id - The requested user's ID
 * @param log - App logger that defaults to a blank logger
 * @returns Publicly viewable seller details and stats
 */
export async function getPublicSellerProfile(id: string, log: AppLogger = noopLogger) {
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
