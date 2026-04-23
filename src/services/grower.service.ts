import { growerRepository } from '../repositories/grower.repository.js';

/**
 * Gets a lightweight list of growers for map display.
 * @param filters - Optional search filters
 * @param filters.buyerId - Filter by growers the buyer ordered from
 * @param filters.lat - The buyers latitude
 * @param filters.lng - The buyers longitude
 * @param filters.maxDistance - The max search distance from the buyer
 * @returns A list of growers containing basic info and star rating
 */
export async function getMapGrowers(filters: {
  buyerId?: string;
  lat?: number;
  lng?: number;
  maxDistance?: number;
}) {
  const rawGrowers = await growerRepository.getGrowersForMap(filters);

  return rawGrowers.map((g) => ({
    sellerId: g.sellerId,
    name: g.name,
    lat: g.lat as number,
    lng: g.lng as number,
    image: g.image,
    rating: Number(Number(g.rating).toFixed(1)),
    specialties: g.specialties || [],
    city: g.city,
    distanceMiles: g.distanceMiles ? Number(Number(g.distanceMiles).toFixed(1)) : null,
  }));
}
