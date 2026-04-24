import { and, eq, notInArray, type SQL, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orderItems, orders, produce, users } from '../db/schema.js';
import type { DbClient, ProduceType } from '../db/types.js';

export const sourceMapRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Internal helper to apply seasonal month filters to a query.
   * @param season - The season
   * @returns EXTRACT statement getting only orders created in the season
   */
  getSeasonCondition(season: string): SQL | undefined {
    if (!season || season === 'all') return undefined;

    switch (season) {
      case 'spring':
        return sql`EXTRACT(MONTH FROM ${orders.createdAt}) IN (3, 4, 5)`;
      case 'summer':
        return sql`EXTRACT(MONTH FROM ${orders.createdAt}) IN (6, 7, 8)`;
      case 'fall':
        return sql`EXTRACT(MONTH FROM ${orders.createdAt}) IN (9, 10, 11)`;
      case 'winter':
        return sql`EXTRACT(MONTH FROM ${orders.createdAt}) IN (12, 1, 2)`;
      default:
        return undefined;
    }
  },

  /**
   * Gets a list of map nodes for the source map.
   * @param filters - Search filters
   * @param filters.buyerId - The buyer ID
   * @param filters.produceType - Optional produce type filter
   * @param filters.season - Optional season filter
   * @returns List of nodes representing sellers and produce
   */
  async getNodes(filters: { buyerId: string; produceType?: ProduceType; season?: string }) {
    let baseConditions = and(
      eq(orders.buyerId, filters.buyerId),
      notInArray(orders.status, ['canceled', 'refund_pending']),
    );

    if (filters.produceType) {
      baseConditions = and(baseConditions, eq(produce.produceType, filters.produceType));
    }

    const seasonCondition = this.getSeasonCondition(filters.season ?? '');
    if (seasonCondition) {
      baseConditions = and(baseConditions, seasonCondition);
    }

    return await this.db
      .select({
        sellerId: users.id,
        name: users.name,
        lat: users.lat,
        lng: users.lng,
        totalVolumeOz: sql<number>`COALESCE(SUM(${orderItems.quantityOz}), 0)`,
        totalSpend: sql<number>`COALESCE(SUM(${orderItems.quantityOz} * ${orderItems.pricePerOz}), 0)`,
        produceCategories: sql<ProduceType[]>`
          COALESCE(
            json_agg(DISTINCT ${produce.produceType}) 
            FILTER (WHERE ${produce.produceType} IS NOT NULL), 
            '[]'
          )
        `,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .innerJoin(users, eq(orders.sellerId, users.id))
      .where(baseConditions)
      .groupBy(users.id, users.name, users.lat, users.lng);
  },

  /**
   * Gets order analytics for a specific buyer.
   * @param filters - Search filters
   * @param filters.buyerId - The buyer ID
   * @param filters.produceType - Optional produce type filter
   * @param filters.season - Optional season filter
   * @returns A set of general totals and a produce order quantity breakdown
   */
  async getAnalytics(filters: { buyerId: string; produceType?: ProduceType; season?: string }) {
    let baseConditions = and(
      eq(orders.buyerId, filters.buyerId),
      notInArray(orders.status, ['canceled', 'refund_pending']),
    );

    if (filters.produceType) {
      baseConditions = and(baseConditions, eq(produce.produceType, filters.produceType));
    }

    const seasonCondition = this.getSeasonCondition(filters.season ?? '');
    if (seasonCondition) {
      baseConditions = and(baseConditions, seasonCondition);
    }

    const [totals] = await this.db
      .select({
        totalVolumeOz: sql<number>`COALESCE(SUM(${orderItems.quantityOz}), 0)`,
        totalSpend: sql<number>`COALESCE(SUM(${orderItems.quantityOz} * ${orderItems.pricePerOz}), 0)`,
        uniqueGrowers: sql<number>`COUNT(DISTINCT ${orders.sellerId})`,
        totalOrders: sql<number>`COUNT(DISTINCT ${orders.id})`,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(baseConditions);

    const breakdown = await this.db
      .select({
        produceType: produce.produceType,
        volumeOz: sql<number>`COALESCE(SUM(${orderItems.quantityOz}), 0)`,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(baseConditions)
      .groupBy(produce.produceType)
      .orderBy(sql`SUM(${orderItems.quantityOz}) DESC`);

    return {
      totals: totals || { totalVolumeOz: 0, totalSpend: 0, uniqueGrowers: 0, totalOrders: 0 },
      breakdown,
    };
  },
};
