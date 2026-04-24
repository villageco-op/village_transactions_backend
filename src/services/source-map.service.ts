import type { ProduceType } from '../db/types.js';
import { sourceMapRepository } from '../repositories/source-map.repository.js';

/**
 * Gets a list of map nodes for teh source map.
 * @param filters - Search filters
 * @param filters.buyerId - The buyer ID
 * @param filters.produceType - Optional produce type filter
 * @param filters.season - Optional season filter
 * @returns List of nodes representing sellers and produce
 */
export async function getSourceMapNodes(filters: {
  buyerId: string;
  produceType?: ProduceType;
  season?: string;
}) {
  const rawNodes = await sourceMapRepository.getNodes(filters);

  return rawNodes.map((node) => {
    const primaryProduceType = node.produceCategories.length > 0 ? node.produceCategories[0] : null;

    return {
      sellerId: node.sellerId,
      name: node.name,
      lat: node.lat ? Number(node.lat) : null,
      lng: node.lng ? Number(node.lng) : null,
      totalVolumeOz: Number(node.totalVolumeOz),
      totalSpend: Number(node.totalSpend),
      primaryProduceType,
      produceCategories: node.produceCategories,
    };
  });
}

/**
 * Gets order analytics for a specific buyer.
 * @param filters - Search filters
 * @param filters.buyerId - The buyer ID
 * @param filters.produceType - Optional produce type filter
 * @param filters.season - Optional season filter
 * @returns A set of general totals and a produce order quantity breakdown
 */
export async function getSourceMapAnalytics(filters: {
  buyerId: string;
  produceType?: ProduceType;
  season?: string;
}) {
  const { totals, breakdown } = await sourceMapRepository.getAnalytics(filters);

  const totalVolumeOz = Number(totals.totalVolumeOz);

  const produceBreakdown = breakdown
    .filter((b) => b.produceType !== null)
    .map((b) => ({
      produceType: b.produceType as ProduceType,
      volumeOz: Number(b.volumeOz),
      percentage: totalVolumeOz > 0 ? (Number(b.volumeOz) / totalVolumeOz) * 100 : 0,
    }));

  const averageSupermarketMiles = 1500;
  const averageLocalMiles = 20;
  const foodMilesSaved = Number(totals.totalOrders) * (averageSupermarketMiles - averageLocalMiles);

  return {
    totalSpend: Number(totals.totalSpend),
    totalVolumeOz,
    uniqueGrowers: Number(totals.uniqueGrowers),
    foodMilesSaved,
    produceBreakdown,
  };
}
