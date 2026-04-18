import { produceRepository } from '../repositories/produce.repository.js';
import { sellerRepository } from '../repositories/seller.repository.js';
import type { SellerDashboardResponse, SellerEarningsResponse } from '../schemas/seller.schema.js';

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
 * @param sellerId - The ID of the seller
 * @returns Formatted dashboard response object
 */
export async function getSellerDashboard(sellerId: string): Promise<SellerDashboardResponse> {
  const [data, activeProduceRaw] = await Promise.all([
    sellerRepository.getDashboardMetrics(sellerId),
    produceRepository.getActiveListingsBySeller(sellerId),
  ]);

  const earnedThisMonth = Number(data.aggregates?.earnedThisMonth || 0);
  const earnedLastMonth = Number(data.aggregates?.earnedLastMonth || 0);
  const soldThisWeekOz = Number(data.weeklySales?.soldThisWeekOz || 0);
  const soldThisWeekLbs = soldThisWeekOz / 16;

  const monthlyGoal = Number(data.seller?.goal || 0);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const expectedProratedGoal = (monthlyGoal / daysInMonth) * currentDay;

  const onTrackWithGoal = monthlyGoal > 0 ? earnedThisMonth >= expectedProratedGoal : true;

  const activeListingsNames = activeProduceRaw.map((p) => p.title || 'Untitled');
  const activeListingsCount = activeListingsNames.length;

  const earningsByProduceThisMonth = data.produceSalesThisMonth.map((item) => ({
    produceName: item.produceName || 'Unknown',
    earned: Number(Number(item.earned || 0).toFixed(2)),
  }));

  return {
    earnedThisMonth: Number(earnedThisMonth.toFixed(2)),
    earnedLastMonth: Number(earnedLastMonth.toFixed(2)),
    soldThisWeekLbs: Number(soldThisWeekLbs.toFixed(2)),
    onTrackWithGoal,
    monthlyGoal: Number(monthlyGoal.toFixed(2)),
    activeListingsCount,
    activeListingsNames,
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
