import { buyerRepository } from '../repositories/buyer.repository.js';
import { subscriptionRepository } from '../repositories/subscription.repository.js';
import type {
  BillingSummaryResponse,
  BuyerDashboardResponse,
  GrowerResponse,
} from '../schemas/buyer.schema.js';
import type { PaginationMetadata } from '../schemas/common.schema.js';

/**
 * Gets a paginated list of growers a buyer has previously bought from with aggregated purchase stats.
 * @param buyerId - The ID of the buyer
 * @param page - Current page number
 * @param limit - Max results per page
 * @param offset - Offset index
 * @returns Paginated grower responses
 */
export async function getGrowersForBuyer(
  buyerId: string,
  page: number,
  limit: number,
  offset: number,
): Promise<{ data: GrowerResponse[]; meta: PaginationMetadata }> {
  const { items, total } = await buyerRepository.getGrowersByBuyerId(buyerId, limit, offset);

  const data = items.map((g) => {
    const firstOrderDate = g.firstOrderDate ? new Date(g.firstOrderDate) : new Date();
    const now = new Date();

    const diffTime = Math.max(0, now.getTime() - firstOrderDate.getTime());
    const daysSinceFirstOrder = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return {
      sellerId: g.sellerId,
      name: g.name,
      address: g.address,
      produceTypesOrdered: g.produceTypesOrdered || [],
      amountOrderedThisMonthLbs: Number((Number(g.amountThisMonthOz || 0) / 16).toFixed(2)),
      daysSinceFirstOrder,
      firstOrderDate: firstOrderDate.toISOString(),
    };
  });

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / (limit || 1)),
    },
  };
}

/**
 * Calculates lifetime billing and sourcing statistics for a buyer.
 * @param buyerId - The buyers ID
 * @returns A billing summary including totalSpent, totalProduceLbs, avgCostPerLb, and localSourcingPercentage
 */
export async function getBillingSummary(buyerId: string): Promise<BillingSummaryResponse> {
  const { orders } = await buyerRepository.getBuyerWithOrdersForSummary(buyerId);

  let totalSpent = 0;
  let totalProduceOz = 0;
  let localOrdersCount = 0;

  for (const order of orders) {
    totalSpent += Number(order.totalAmount || 0);
    totalProduceOz += Number(order.totalOz || 0);

    if (order.isLocal) {
      localOrdersCount++;
    }
  }

  const totalProduceLbs = totalProduceOz / 16;
  const avgCostPerLb = totalProduceLbs > 0 ? totalSpent / totalProduceLbs : 0;
  const localSourcingPercentage = orders.length > 0 ? (localOrdersCount / orders.length) * 100 : 0;

  return {
    totalSpent: Number(totalSpent.toFixed(2)),
    totalProduceLbs: Number(totalProduceLbs.toFixed(2)),
    avgCostPerLb: Number(avgCostPerLb.toFixed(2)),
    localSourcingPercentage: Number(localSourcingPercentage.toFixed(2)),
  };
}

/**
 * Calculates dashboard metrics and returns the structured dashboard view.
 * @param buyerId - The ID of the buyer
 * @returns Dashboard metrics structure
 */
export async function getBuyerDashboardMetrics(buyerId: string): Promise<BuyerDashboardResponse> {
  const [data, activeSubsRaw] = await Promise.all([
    buyerRepository.getDashboardMetrics(buyerId),
    subscriptionRepository.getActiveSubscriptionsForBuyer(buyerId),
  ]);

  const ozThisWeek = Number(data.weightAgg?.ozThisWeek || 0);
  const ozLastWeek = Number(data.weightAgg?.ozLastWeek || 0);
  const spendThisMonth = Number(data.spendAgg?.spendThisMonth || 0);
  const spendLastMonth = Number(data.spendAgg?.spendLastMonth || 0);

  const onOrderThisWeekLbs = ozThisWeek / 16;
  const onOrderLastWeekLbs = ozLastWeek / 16;

  let percentChangeFromLastWeek = 0;
  if (onOrderLastWeekLbs === 0) {
    percentChangeFromLastWeek = onOrderThisWeekLbs > 0 ? 100 : 0;
  } else {
    percentChangeFromLastWeek =
      ((onOrderThisWeekLbs - onOrderLastWeekLbs) / onOrderLastWeekLbs) * 100;
  }

  const activeSubscriptions = activeSubsRaw.map((s) => ({
    id: s.id,
    produceName: s.produceName,
    amount: Number((Number(s.amount) / 16).toFixed(2)),
  }));

  let localGrowersSupplying = 0;
  let maxDist = 0;
  let sumDist = 0;
  let validDistCount = 0;

  for (const g of data.growers) {
    if (g.isLocal) {
      localGrowersSupplying++;
    }

    if (g.distance !== null) {
      const dist = Number(g.distance);
      if (dist > maxDist) maxDist = dist;
      sumDist += dist;
      validDistCount++;
    }
  }

  const avgGrowerDistanceMiles = validDistCount > 0 ? sumDist / validDistCount : 0;

  return {
    onOrderThisWeekLbs: Number(onOrderThisWeekLbs.toFixed(2)),
    percentChangeFromLastWeek: Number(percentChangeFromLastWeek.toFixed(2)),
    totalSpendThisMonth: Number(spendThisMonth.toFixed(2)),
    totalSpendLastMonth: Number(spendLastMonth.toFixed(2)),
    activeSubscriptions,
    localGrowersSupplying,
    furthestGrowerDistanceMiles: Number(maxDist.toFixed(2)),
    avgGrowerDistanceMiles: Number(avgGrowerDistanceMiles.toFixed(2)),
  };
}
