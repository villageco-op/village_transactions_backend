import { buyerRepository } from '../repositories/buyer.repository.js';
import type { GrowerResponse } from '../schemas/buyer.schema.js';

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
