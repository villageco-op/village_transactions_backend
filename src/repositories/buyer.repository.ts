import { eq, and, sql, ne } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { users, orders, orderItems, produce } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const buyerRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves an aggregated list of sellers (growers) a specific buyer has purchased from.
   * @param buyerId - The unique user ID of the buyer.
   * @param limit - Number of records to return.
   * @param offset - Number of records to skip.
   * @param search - Produce type or user name text search.
   * @param distanceFilter - The buyers location and a max search distance.
   * @param distanceFilter.lat - The buyers latitude
   * @param distanceFilter.lng - The buyers longitude
   * @param distanceFilter.maxDistance - The maximum distance from the buyer
   * @returns An object containing items and total count.
   */
  async getGrowersByBuyerId(
    buyerId: string,
    limit: number,
    offset: number,
    search?: string,
    distanceFilter?: { lat: number; lng: number; maxDistance: number },
  ) {
    const conditions = [eq(orders.buyerId, buyerId), eq(orders.status, 'completed')];

    if (search) {
      conditions.push(
        sql`(${produce.produceType} ILIKE ${`%${search}%`} OR ${users.name} ILIKE ${`%${search}%`})`,
      );
    }

    if (distanceFilter) {
      conditions.push(
        sql`ST_Distance(
          ST_MakePoint(${users.lng}, ${users.lat})::geography, 
          ST_MakePoint(${distanceFilter.lng}, ${distanceFilter.lat})::geography
        ) <= ${distanceFilter.maxDistance * 1609.34}`,
      );
    }

    const whereClause = and(...conditions);

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(distinct ${users.id})::int`,
        cities: sql<
          string[]
        >`array_agg(distinct ${users.city}) FILTER (WHERE ${users.city} IS NOT NULL)`,
      })
      .from(users)
      .innerJoin(orders, eq(users.id, orders.sellerId))
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(whereClause);

    const total = totalCountResult?.count || 0;
    const cities = totalCountResult?.cities || [];

    const items = await this.db
      .select({
        sellerId: users.id,
        name: users.name,
        address: users.address,
        lat: users.lat,
        lng: users.lng,
        city: users.city,
        state: users.state,
        country: users.country,
        zip: users.zip,
        produceTypesOrdered: sql<
          string[]
        >`array_agg(DISTINCT ${produce.produceType}) FILTER (WHERE ${produce.produceType} IS NOT NULL)`,
        amountThisMonthOz: sql<
          number | string
        >`COALESCE(SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', CURRENT_DATE) THEN ${orderItems.quantityOz} ELSE 0 END), 0)`,
        firstOrderDate: sql<Date>`MIN(${orders.createdAt})`,
      })
      .from(users)
      .innerJoin(orders, eq(users.id, orders.sellerId))
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(whereClause)
      .groupBy(users.id)
      .limit(limit)
      .offset(offset);

    return { items, total, cities };
  },

  /**
   * Retrieves the buyer's address and a flattened list of their completed orders
   * joined with the seller's address and aggregated item weights.
   * @param buyerId - The buyers ID
   * @returns The buyers address and a list of completed orders.
   */
  async getBuyerWithOrdersForSummary(buyerId: string) {
    const ordersData = await this.db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        totalOz: sql<number | string>`SUM(${orderItems.quantityOz})`,
        isLocal: sql<boolean>`
          (${users.city} = (SELECT city FROM ${users} WHERE id = ${buyerId})) OR 
          (ST_Distance(${users.location}, (SELECT location FROM ${users} WHERE id = ${buyerId})) / 1609.344 <= 50)
        `,
      })
      .from(orders)
      .innerJoin(users, eq(orders.sellerId, users.id))
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.buyerId, buyerId), eq(orders.status, 'completed')))
      .groupBy(orders.id, orders.totalAmount, users.city, users.location);

    return { orders: ordersData };
  },

  /**
   * Fetches the raw dashboard metrics for a buyer, including spend, volume, and grower distances.
   * @param buyerId - The buyer's ID
   * @returns Raw dashboard aggregates
   */
  async getDashboardMetrics(buyerId: string) {
    const [spendAgg] = await this.db
      .select({
        spendThisMonth: sql<
          number | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', CURRENT_DATE) THEN ${orders.totalAmount} ELSE 0 END)`,
        spendLastMonth: sql<
          number | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month') THEN ${orders.totalAmount} ELSE 0 END)`,
      })
      .from(orders)
      .where(and(eq(orders.buyerId, buyerId), ne(orders.status, 'canceled')));

    const [weightAgg] = await this.db
      .select({
        ozThisWeek: sql<
          number | null
        >`SUM(CASE WHEN date_trunc('week', ${orders.createdAt}) = date_trunc('week', CURRENT_DATE) THEN ${orderItems.quantityOz} ELSE 0 END)`,
        ozLastWeek: sql<
          number | null
        >`SUM(CASE WHEN date_trunc('week', ${orders.createdAt}) = date_trunc('week', CURRENT_DATE - INTERVAL '1 week') THEN ${orderItems.quantityOz} ELSE 0 END)`,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.buyerId, buyerId), ne(orders.status, 'canceled')));

    const growers = await this.db
      .select({
        sellerId: users.id,
        distance: sql<
          number | null
        >`ST_Distance(${users.location}, (SELECT location FROM ${users} WHERE id = ${buyerId})) / 1609.344`,
        isLocal: sql<boolean>`
          (${users.city} = (SELECT city FROM ${users} WHERE id = ${buyerId})) OR 
          (ST_Distance(${users.location}, (SELECT location FROM ${users} WHERE id = ${buyerId})) / 1609.344 <= 50)
        `,
      })
      .from(users)
      .innerJoin(orders, eq(users.id, orders.sellerId))
      .where(and(eq(orders.buyerId, buyerId), ne(orders.status, 'canceled')))
      .groupBy(users.id, users.location, users.city);

    return { spendAgg, weightAgg, growers };
  },
};
