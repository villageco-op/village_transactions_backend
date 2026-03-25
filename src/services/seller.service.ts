import { sellerRepository } from '../repositories/seller.repository.js';
import type { SellerEarningsResponse } from '../schemas/seller.schema.js';

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
