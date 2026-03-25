import { buyerRepository } from '../repositories/buyer.repository.js';
import type { BillingSummaryResponse, GrowerResponse } from '../schemas/buyer.schema.js';

/**
 * Gets a list of growers a buyer has previously bought from with aggregated purchase stats.
 * @param buyerId - The ID of the buyer
 * @param limit - Max results
 * @param offset - Offset index
 * @returns Array of formatted grower objects
 */
export async function getGrowersForBuyer(
  buyerId: string,
  limit: number,
  offset: number,
): Promise<GrowerResponse[]> {
  const growers = await buyerRepository.getGrowersByBuyerId(buyerId, limit, offset);

  return growers.map((g) => {
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
}

/**
 * Extracts the city from a standard address string (e.g., "123 Main St, Springfield, IL 62701").
 * @param address - Address as a string (Street, City, State) or (City, State).
 * @returns The city name.
 */
function parseCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',');
  if (parts.length >= 3) return parts[1].trim().toLowerCase(); // Format: "Street, City, State"
  if (parts.length === 2) return parts[0].trim().toLowerCase(); // Format: "City, State"
  return address.trim().toLowerCase(); // Format: "City" or unknown fallback
}

/**
 * Calculates lifetime billing and sourcing statistics for a buyer.
 * @param buyerId - The buyers ID
 * @returns A billing summary including totalSpent, totalProduceLbs, avgCostPerLb, and localSourcingPercentage
 */
export async function getBillingSummary(buyerId: string): Promise<BillingSummaryResponse> {
  const { buyerAddress, orders } = await buyerRepository.getBuyerWithOrdersForSummary(buyerId);

  let totalSpent = 0;
  let totalProduceOz = 0;
  let localOrdersCount = 0;

  const buyerCity = parseCity(buyerAddress);

  for (const order of orders) {
    totalSpent += Number(order.totalAmount || 0);
    totalProduceOz += Number(order.totalOz || 0);

    if (buyerCity) {
      const sellerCity = parseCity(order.sellerAddress);
      if (sellerCity === buyerCity) {
        localOrdersCount++;
      }
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
