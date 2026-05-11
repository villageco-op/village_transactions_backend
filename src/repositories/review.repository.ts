import { and, asc, desc, eq, exists, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orderItems, reviews, users } from '../db/schema.js';
import type { DbClient } from '../db/types.js';

export const reviewRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Inserts a new review into the database.
   * @param data - The review data to insert (inferred from schema)
   * @returns The created review object, or null if the insertion failed
   */
  async create(data: typeof reviews.$inferInsert) {
    const [review] = await this.db.insert(reviews).values(data).returning();
    return review ?? null;
  },

  /**
   * Finds a review by a specific buyer for a specific order.
   * @param orderId - The unique identifier of the order
   * @param buyerId - The unique identifier of the buyer
   * @returns The review object if found, otherwise null
   */
  async findByOrderAndBuyer(orderId: string, buyerId: string) {
    const [review] = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.orderId, orderId), eq(reviews.buyerId, buyerId)))
      .limit(1);

    return review ?? null;
  },

  /**
   * Fetches a paginated and sorted list of reviews for a given seller,
   * including buyer profile information via a left join.
   * @param sellerId - The unique identifier of the seller
   * @param options - Configuration for pagination and sorting
   * @param options.limit - The number of records to return
   * @param options.offset - The number of records to skip
   * @param options.sortBy - The column to sort by ('createdAt' or 'rating')
   * @param options.sortOrder - The direction of the sort ('asc' or 'desc')
   * @param options.productId - Filter by reviews connected to a product
   * @returns A list of review objects with nested buyer details
   */
  async findReviewsBySellerId(
    sellerId: string,
    options: {
      limit: number;
      offset: number;
      sortBy: 'createdAt' | 'rating';
      sortOrder: 'asc' | 'desc';
      productId?: string;
    },
  ) {
    const sortCol = options.sortBy === 'rating' ? reviews.rating : reviews.createdAt;
    const sortFunc = options.sortOrder === 'desc' ? desc : asc;

    const conditions = [eq(reviews.sellerId, sellerId)];

    if (options.productId) {
      conditions.push(eq(orderItems.productId, options.productId));
    }

    const query = this.db
      .selectDistinct({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        buyer: {
          id: users.id,
          name: users.name,
          image: users.image,
        },
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.buyerId, users.id));

    if (options.productId) {
      query.innerJoin(orderItems, eq(reviews.orderId, orderItems.orderId));
    }

    const result = await query
      .where(and(...conditions))
      .orderBy(sortFunc(sortCol))
      .limit(options.limit)
      .offset(options.offset);

    return result;
  },

  /**
   * Counts the total number of reviews for a seller,
   * optionally filtered by a specific product.
   * @remarks Useful for calculating total pages in pagination.
   * @param sellerId - The unique identifier of the seller
   * @param productId - (Optional) Only count reviews related to a product
   * @returns The total count of reviews as a number
   */
  async countBySellerId(sellerId: string, productId?: string): Promise<number> {
    const conditions = [eq(reviews.sellerId, sellerId)];

    if (productId) {
      conditions.push(
        exists(
          this.db
            .select()
            .from(orderItems)
            .where(
              and(eq(orderItems.orderId, reviews.orderId), eq(orderItems.productId, productId)),
            ),
        ),
      );
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(and(...conditions));

    return result?.count ?? 0;
  },

  /**
   * Aggregates review counts by rating for a given seller.
   * @param sellerId - The unique identifier of the seller
   * @returns An array of objects containing the rating and count
   */
  async getReviewStatsBySellerId(sellerId: string) {
    const result = await this.db
      .select({
        rating: reviews.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.sellerId, sellerId))
      .groupBy(reviews.rating);

    return result;
  },
};
