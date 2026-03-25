import { eq, and, sql } from 'drizzle-orm';

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
   * @returns A list of growers.
   */
  async getGrowersByBuyerId(buyerId: string, limit: number, offset: number) {
    return await this.db
      .select({
        sellerId: users.id,
        name: users.name,
        address: users.address,
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
      .where(and(eq(orders.buyerId, buyerId), eq(orders.status, 'completed')))
      .groupBy(users.id)
      .limit(limit)
      .offset(offset);
  },

  /**
   * Retrieves the buyer's address and a flattened list of their completed orders
   * joined with the seller's address and aggregated item weights.
   * @param buyerId - The buyers ID
   * @returns The buyers address and a list of completed orders.
   */
  async getBuyerWithOrdersForSummary(buyerId: string) {
    const buyerQuery = await this.db
      .select({ address: users.address })
      .from(users)
      .where(eq(users.id, buyerId))
      .limit(1);

    const ordersData = await this.db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        sellerAddress: users.address,
        totalOz: sql<number | string>`SUM(${orderItems.quantityOz})`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.sellerId, users.id))
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.buyerId, buyerId), eq(orders.status, 'completed')))
      .groupBy(orders.id, orders.totalAmount, users.address);

    return {
      buyerAddress: buyerQuery[0]?.address ?? null,
      orders: ordersData,
    };
  },
};
