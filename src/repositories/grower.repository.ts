import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orders, reviews, users } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const growerRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Gets a lightweight list of growers for map display.
   * @param filters - Optional search filters
   * @param filters.buyerId - Filter by growers the buyer ordered from
   * @param filters.lat - The buyers latitude
   * @param filters.lng - The buyers longitude
   * @param filters.maxDistance - The max search distance from the buyer
   * @returns A list of growers containing basic info and star rating
   */
  async getGrowersForMap(filters: {
    buyerId?: string;
    lat?: number;
    lng?: number;
    maxDistance?: number;
  }) {
    const conditions = [
      isNotNull(users.lat),
      isNotNull(users.lng),
      eq(users.stripeOnboardingComplete, true),
    ];

    // Filter to only growers the user has successfully purchased from
    if (filters.buyerId) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${orders}
          WHERE ${orders.sellerId} = ${users.id}
            AND ${orders.buyerId} = ${filters.buyerId}
            AND ${orders.status} = 'completed'
        )`,
      );
    }

    // Filter by geographic distance
    if (
      filters.lat !== undefined &&
      filters.lng !== undefined &&
      filters.maxDistance !== undefined
    ) {
      conditions.push(
        sql`ST_Distance(
          ${users.location}, 
          ST_MakePoint(${filters.lng}, ${filters.lat})::geography
        ) <= ${filters.maxDistance * 1609.344}`, // Miles to Meters
      );
    }

    const items = await this.db
      .select({
        sellerId: users.id,
        name: users.name,
        lat: users.lat,
        lng: users.lng,
        image: users.image,
        rating: sql<number | string>`COALESCE(AVG(${reviews.rating}), 0)`,
      })
      .from(users)
      .leftJoin(reviews, eq(users.id, reviews.sellerId))
      .where(and(...conditions))
      .groupBy(users.id);

    return items;
  },
};
