import { eq, and, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orderItems, orders, produce, users } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const sellerRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Fetches raw metrics to compute the seller's earnings dashboard
   * @param sellerId - The seller's user ID
   * @returns Aggregated metrics for earnings, volumes, and produce-specific sales
   */
  async getEarningsMetrics(sellerId: string) {
    const now = new Date();

    const [seller] = await this.db
      .select({ goal: users.goal })
      .from(users)
      .where(eq(users.id, sellerId));

    const [aggregates] = await this.db
      .select({
        earnedThisMonth: sql<
          number | string | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp) THEN ${orders.totalAmount} ELSE 0 END)`,
        earnedLastMonth: sql<
          number | string | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp - INTERVAL '1 month') THEN ${orders.totalAmount} ELSE 0 END)`,
        totalEarnedYTD: sql<
          number | string | null
        >`SUM(CASE WHEN date_trunc('year', ${orders.createdAt}) = date_trunc('year', ${now}::timestamp) THEN ${orders.totalAmount} ELSE 0 END)`,
        totalEarnedLifetime: sql<number | string | null>`SUM(${orders.totalAmount})`,
      })
      .from(orders)
      .where(and(eq(orders.sellerId, sellerId), eq(orders.status, 'completed')));

    const [weightAgg] = await this.db
      .select({
        totalOzLifetime: sql<number | string | null>`SUM(${orderItems.quantityOz})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.sellerId, sellerId), eq(orders.status, 'completed')));

    const produceSalesThisMonth = await this.db
      .select({
        produceName: produce.title,
        amount: sql<
          number | string | null
        >`SUM(${orderItems.quantityOz} * ${orderItems.pricePerOz})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(
        and(
          eq(orders.sellerId, sellerId),
          eq(orders.status, 'completed'),
          sql`date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp)`,
        ),
      )
      .groupBy(produce.title);

    return {
      goal: seller?.goal,
      aggregates,
      weightAgg,
      produceSalesThisMonth,
    };
  },

  /**
   * Fetches high-level metrics required for the seller dashboard.
   * @param sellerId - The seller's user ID
   * @returns Aggregated metrics for high-level main view
   */
  async getDashboardMetrics(sellerId: string) {
    const now = new Date();

    const [seller] = await this.db
      .select({
        goal: users.goal,
        address: users.address,
        lat: sql<number | null>`ST_Y(${users.location}::geometry)`,
        lng: sql<number | null>`ST_X(${users.location}::geometry)`,
      })
      .from(users)
      .where(eq(users.id, sellerId));

    const [aggregates] = await this.db
      .select({
        earnedThisMonth: sql<
          number | string | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp) THEN ${orders.totalAmount} ELSE 0 END)`,
        earnedLastMonth: sql<
          number | string | null
        >`SUM(CASE WHEN date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp - INTERVAL '1 month') THEN ${orders.totalAmount} ELSE 0 END)`,
      })
      .from(orders)
      .where(and(eq(orders.sellerId, sellerId), eq(orders.status, 'completed')));

    const [weeklySales] = await this.db
      .select({
        soldThisWeekOz: sql<number | string | null>`SUM(${orderItems.quantityOz})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.sellerId, sellerId),
          eq(orders.status, 'completed'),
          sql`date_trunc('week', ${orders.createdAt}) = date_trunc('week', ${now}::timestamp)`,
        ),
      );

    const produceSalesThisMonth = await this.db
      .select({
        produceName: produce.title,
        earned: sql<
          number | string | null
        >`SUM(${orderItems.quantityOz} * ${orderItems.pricePerOz})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(produce, eq(orderItems.productId, produce.id))
      .where(
        and(
          eq(orders.sellerId, sellerId),
          eq(orders.status, 'completed'),
          sql`date_trunc('month', ${orders.createdAt}) = date_trunc('month', ${now}::timestamp)`,
        ),
      )
      .groupBy(produce.title);

    return {
      seller,
      aggregates,
      weeklySales,
      produceSalesThisMonth,
    };
  },
};
