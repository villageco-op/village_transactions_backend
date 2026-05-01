import { and, asc, eq, isNotNull, sql, desc } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { orderItems, orders, produce, users } from '../db/schema.js';
import type { DbClient, ProduceType } from '../db/types.js';
import { getSeasonCondition } from '../db/utils.js';
import type { Season } from '../schemas/common.schema.js';
import type { CreateProducePayload, UpdateProducePayload } from '../schemas/produce.schema.js';

type Produce = typeof produce.$inferSelect;

export const produceRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves a specific produce listing by its ID, including basic seller information.
   * @param id - The ID of the produce listing
   * @returns The produce record with seller details, or undefined if not found
   */
  async getById(id: string) {
    const [item] = await this.db
      .select({
        produce: produce,
        seller: {
          id: users.id,
          name: users.name,
          image: users.image,
          deliveryRangeMiles: users.deliveryRangeMiles,
          lat: users.lat,
          lng: users.lng,
          address: users.address,
          city: users.city,
          state: users.state,
          country: users.country,
          zip: users.zip,
        },
      })
      .from(produce)
      .innerJoin(users, eq(produce.sellerId, users.id))
      .where(eq(produce.id, id));

    if (!item) {
      return undefined;
    }

    const range = item.seller.deliveryRangeMiles ? Number(item.seller.deliveryRangeMiles) : 0;

    return {
      ...item.produce,
      seller: {
        id: item.seller.id,
        name: item.seller.name,
        image: item.seller.image,
        deliveryRangeMiles: range,
        canDeliver: range > 0,
        location: {
          lat: item.seller.lat,
          lng: item.seller.lng,
          address: item.seller.address,
          city: item.seller.city,
          state: item.seller.state,
          country: item.seller.country,
          zip: item.seller.zip,
        },
      },
    };
  },

  /**
   * Creates a new produce listing in the database.
   * @param sellerId - The ID of the user creating the listing
   * @param data - The parsed payload containing listing details
   * @returns The newly created produce record
   */
  async create(sellerId: string, data: CreateProducePayload): Promise<Produce> {
    const [newProduce] = await this.db
      .insert(produce)
      .values({
        sellerId,
        title: data.title,
        produceType: data.produceType,
        pricePerOz: data.pricePerOz.toString(),
        totalOzInventory: data.totalOzInventory.toString(),
        maxOrderQuantityOz: data.maxOrderQuantityOz ? data.maxOrderQuantityOz.toString() : null,
        availableBy: data.availableBy ?? new Date(),
        harvestFrequencyDays: data.harvestFrequencyDays,
        seasonStart: data.seasonStart,
        seasonEnd: data.seasonEnd,
        images: data.images,
        isSubscribable: data.isSubscribable,
      })
      .returning();

    return newProduce;
  },

  /**
   * Updates an existing produce listing.
   * @param id - The ID of the produce listing
   * @param sellerId - The ID of the user updating the listing (for authorization)
   * @param data - The parsed payload containing fields to update
   * @returns The updated produce record, or undefined if not found/unauthorized
   */
  async update(
    id: string,
    sellerId: string,
    data: UpdateProducePayload,
  ): Promise<Produce | undefined> {
    const { pricePerOz, totalOzInventory, maxOrderQuantityOz, ...remainingData } = data;

    const updateValues: Partial<typeof produce.$inferInsert> = {
      ...remainingData,
      updatedAt: new Date(),
    };

    if (pricePerOz !== undefined) {
      updateValues.pricePerOz = pricePerOz.toString();
    }

    if (totalOzInventory !== undefined) {
      updateValues.totalOzInventory = totalOzInventory.toString();
    }

    if (maxOrderQuantityOz !== undefined) {
      updateValues.maxOrderQuantityOz = maxOrderQuantityOz ? maxOrderQuantityOz.toString() : null;
    }

    const [updatedProduce] = await this.db
      .update(produce)
      .set(updateValues)
      .where(and(eq(produce.id, id), eq(produce.sellerId, sellerId)))
      .returning();

    return updatedProduce;
  },

  /**
   * Soft deletes a produce listing by marking its status as deleted and clearing its images.
   * @param id - The ID of the produce listing
   * @param sellerId - The ID of the user deleting the listing (for authorization)
   * @returns A boolean indicating whether the record was successfully found and deleted
   */
  async softDelete(id: string, sellerId: string): Promise<boolean> {
    const [deletedProduce] = await this.db
      .update(produce)
      .set({
        status: 'deleted',
        images: [],
        updatedAt: new Date(),
      })
      .where(and(eq(produce.id, id), eq(produce.sellerId, sellerId)))
      .returning({ id: produce.id });

    return !!deletedProduce;
  },

  /**
   * Retrieves a paginated list of active produce, calculating distance using PostGIS.
   * Joins with the `users` table to fetch seller information and location data.
   * @param params - The search and pagination parameters.
   * @param params.lat - Latitude for distance calculation.
   * @param params.lng - Longitude for distance calculation.
   * @param params.sortBy - Field to sort by. 'distance' uses spatial calculation; 'price' uses numeric value.
   * @param params.hasDelivery - If 'true', filters for sellers where distance <= their delivery range.
   * @param params.produceType - Filter by specific produce category.
   * @param params.search - Text search filter for produce title, type, or seller name.
   * @param params.maxOrderQuantity - Filters for listings that allow an order of at least this quantity (in oz).
   * @param params.isSubscribable - Filter by subscription availability ('true' or 'false').
   * @param params.availableInventory - Minimum inventory required (in oz).
   * @param params.season - Filter by seasonal availability.
   * @param params.availableBy - Filters for produce available on or before this date.
   * @param params.minPrice - Minimum price per ounce.
   * @param params.maxPrice - Maximum price per ounce.
   * @param params.maxDistance - Maximum distance in miles from the provided coordinates.
   * @param params.limit - Max items per page.
   * @param params.offset - Starting index for results.
   * @returns An object containing the paginated items and total count.
   */
  async getList(params: {
    lat: number;
    lng: number;
    sortBy?: 'distance' | 'price';
    hasDelivery?: 'true' | 'false';
    produceType?: ProduceType;
    search?: string;
    maxOrderQuantity?: number;
    isSubscribable?: 'true' | 'false';
    availableInventory?: number;
    season?: Season;
    availableBy?: Date;
    minPrice?: number;
    maxPrice?: number;
    maxDistance?: number;
    limit: number;
    offset: number;
  }) {
    const { lat, lng, sortBy, hasDelivery, limit, offset } = params;

    const userLocation = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const distanceMiles = sql<number>`ST_Distance(${users.location}, ${userLocation}) / 1609.344`;

    // Baseline checks: Active produce and seller must have completed stripe onboarding
    const conditions = [eq(produce.status, 'active'), eq(users.stripeOnboardingComplete, true)];

    if (hasDelivery === 'true') {
      conditions.push(sql`${users.deliveryRangeMiles} > 0`);
      conditions.push(sql`${distanceMiles} <= ${users.deliveryRangeMiles}`);
    }

    if (params.produceType) {
      conditions.push(eq(produce.produceType, params.produceType));
    }

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        sql`(${produce.title} ILIKE ${searchPattern} OR ${produce.produceType}::text ILIKE ${searchPattern} OR ${users.name} ILIKE ${searchPattern})`,
      );
    }

    if (params.maxOrderQuantity !== undefined) {
      // Return listings that allow an order of AT LEAST this quantity, or have no limit
      conditions.push(
        sql`(${produce.maxOrderQuantityOz} >= ${params.maxOrderQuantity} OR ${produce.maxOrderQuantityOz} IS NULL)`,
      );
    }

    if (params.isSubscribable === 'true') {
      conditions.push(eq(produce.isSubscribable, true));
    } else if (params.isSubscribable === 'false') {
      conditions.push(eq(produce.isSubscribable, false));
    }

    if (params.availableInventory !== undefined) {
      conditions.push(sql`${produce.totalOzInventory} >= ${params.availableInventory}`);
    }

    if (params.season) {
      const seasonCondition = getSeasonCondition(params.season, produce.availableBy);
      if (seasonCondition) {
        conditions.push(seasonCondition);
      }
    }

    if (params.availableBy) {
      conditions.push(sql`${produce.availableBy} <= ${params.availableBy}`);
    }

    if (params.minPrice !== undefined) {
      conditions.push(sql`${produce.pricePerOz} >= ${params.minPrice}`);
    }

    if (params.maxPrice !== undefined) {
      conditions.push(sql`${produce.pricePerOz} <= ${params.maxPrice}`);
    }

    if (params.maxDistance !== undefined) {
      conditions.push(sql`${distanceMiles} <= ${params.maxDistance}`);
    }

    const whereClause = and(...conditions);

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(produce)
      .innerJoin(users, eq(produce.sellerId, users.id))
      .where(whereClause);

    const total = totalCountResult?.count || 0;

    let query = this.db
      .select({
        id: produce.id,
        name: produce.title,
        price: produce.pricePerOz,
        amount: produce.totalOzInventory,
        images: produce.images,
        isSubscribable: produce.isSubscribable,
        availableBy: produce.availableBy,
        sellerId: users.id,
        sellerName: users.name,
        distance: distanceMiles.as('distance'),
      })
      .from(produce)
      .innerJoin(users, eq(produce.sellerId, users.id))
      .where(whereClause)
      .$dynamic();

    if (sortBy === 'price') {
      query = query.orderBy(asc(produce.pricePerOz));
    } else {
      query = query.orderBy(asc(distanceMiles));
    }

    const items = await query.limit(limit).offset(offset);

    return { items, total };
  },

  /**
   * Retrieves a lightweight list of produce map items using spatial filtering.
   * Extracts latitude and longitude directly from PostGIS geography by casting to geometry.
   * @param params - Search parameters for the spatial query.
   * @param params.lat - The latitude of the search center.
   * @param params.lng - The longitude of the search center.
   * @param params.radiusMiles - The radius (in miles) to search within. Defaults to 50.
   * @param params.produceType - Filter by a specific type of produce (e.g., 'fruit', 'veg').
   * @param params.search - Text search filter for produce title, type, or seller name.
   * @param params.maxOrderQuantity - Filters for listings that allow an order of at least this quantity (in oz).
   * @param params.isSubscribable - Filter by subscription availability ('true' or 'false').
   * @param params.availableInventory - Minimum inventory required (in oz).
   * @param params.season - Filter by seasonal availability.
   * @param params.availableBy - Filters for produce available on or before this date.
   * @param params.hasDelivery - If 'true', limits results to sellers whose delivery range covers the user.
   * @param params.minPrice - Minimum price per ounce.
   * @param params.maxPrice - The maximum allowed price per ounce for the items.
   * @returns A promise resolving to an array of items containing basic produce info and seller coordinates.
   */
  async getMapItems(params: {
    lat: number;
    lng: number;
    radiusMiles?: number;
    produceType?: ProduceType;
    search?: string;
    maxOrderQuantity?: number;
    isSubscribable?: 'true' | 'false';
    availableInventory?: number;
    season?: Season;
    availableBy?: Date;
    hasDelivery?: 'true' | 'false';
    minPrice?: number;
    maxPrice?: number;
  }) {
    const { lat, lng, radiusMiles = 50, hasDelivery, produceType, maxPrice } = params;

    const userLocation = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const distanceMiles = sql<number>`ST_Distance(${users.location}, ${userLocation}) / 1609.344`;

    // Baseline constraints: active produce, seller has location & onboarded completely
    const conditions = [
      eq(produce.status, 'active'),
      eq(users.stripeOnboardingComplete, true),
      isNotNull(users.location),
      sql`${distanceMiles} <= ${radiusMiles}`,
    ];

    if (hasDelivery === 'true') {
      conditions.push(sql`${users.deliveryRangeMiles} > 0`);
      conditions.push(sql`${distanceMiles} <= ${users.deliveryRangeMiles}`);
    }

    if (produceType) {
      conditions.push(eq(produce.produceType, produceType));
    }

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        sql`(${produce.title} ILIKE ${searchPattern} OR ${produce.produceType}::text ILIKE ${searchPattern} OR ${users.name} ILIKE ${searchPattern})`,
      );
    }

    if (params.maxOrderQuantity !== undefined) {
      conditions.push(
        sql`(${produce.maxOrderQuantityOz} >= ${params.maxOrderQuantity} OR ${produce.maxOrderQuantityOz} IS NULL)`,
      );
    }

    if (params.isSubscribable === 'true') {
      conditions.push(eq(produce.isSubscribable, true));
    } else if (params.isSubscribable === 'false') {
      conditions.push(eq(produce.isSubscribable, false));
    }

    if (params.availableInventory !== undefined) {
      conditions.push(sql`${produce.totalOzInventory} >= ${params.availableInventory}`);
    }

    if (params.season) {
      const seasonCondition = getSeasonCondition(params.season, produce.availableBy);
      if (seasonCondition) {
        conditions.push(seasonCondition);
      }
    }

    if (params.availableBy) {
      conditions.push(sql`${produce.availableBy} <= ${params.availableBy}`);
    }

    if (params.minPrice !== undefined) {
      conditions.push(sql`${produce.pricePerOz} >= ${params.minPrice}`);
    }

    if (maxPrice !== undefined) {
      conditions.push(sql`${produce.pricePerOz} <= ${maxPrice}`);
    }

    return await this.db
      .select({
        id: produce.id,
        name: produce.title,
        type: produce.produceType,
        images: produce.images,
        price: produce.pricePerOz,
        availableInventory: produce.totalOzInventory,
        availableBy: produce.availableBy,
        seasonStart: produce.seasonStart,
        seasonEnd: produce.seasonEnd,
        isSubscribable: produce.isSubscribable,
        sellerId: users.id,
        sellerName: users.name,
        lat: sql<number>`ST_Y(${users.location}::geometry)`,
        lng: sql<number>`ST_X(${users.location}::geometry)`,
      })
      .from(produce)
      .innerJoin(users, eq(produce.sellerId, users.id))
      .where(and(...conditions));
  },

  /**
   * Retrieves a paginated list of orders for a specific produce listing.
   * Ensures the requesting user is the seller of the produce.
   * @param produceId - The ID of the produce listing.
   * @param sellerId - The ID of the seller requesting the data (for authorization).
   * @param limit - Max items per page.
   * @param offset - Starting index.
   * @returns Object containing the paginated items and total count, or null if unauthorized/not found.
   */
  async getProduceOrders(produceId: string, sellerId: string, limit: number, offset: number) {
    const [ownershipCheck] = await this.db
      .select({ id: produce.id })
      .from(produce)
      .where(and(eq(produce.id, produceId), eq(produce.sellerId, sellerId)));

    if (!ownershipCheck) {
      return null;
    }

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(orderItems)
      .where(eq(orderItems.productId, produceId));

    const total = totalCountResult?.count || 0;

    const items = await this.db
      .select({
        id: orders.id,
        status: orders.status,
        fulfillmentType: orders.fulfillmentType,
        scheduledTime: orders.scheduledTime,
        totalAmount: orders.totalAmount,
        quantityOz: orderItems.quantityOz,
        createdAt: orders.createdAt,
        buyer: {
          id: users.id,
          name: users.name,
          image: users.image,
        },
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orderItems.productId, produceId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },

  /**
   * Retrieves a paginated list of a seller's own produce listings with full details.
   * @param params - The configuration object for the produce query.
   * @param params.sellerId - The ID of the seller whose listings are being fetched.
   * @param params.limit - Max items per page.
   * @param params.offset - Starting index for results.
   * @param params.status - Optional status filter (active, paused, deleted).
   * @returns Object containing the paginated items and total count.
   */
  async getSellerListings(params: {
    sellerId: string;
    limit: number;
    offset: number;
    status?: 'active' | 'paused' | 'deleted';
  }) {
    const { sellerId, limit, offset, status } = params;

    const conditions = [eq(produce.sellerId, sellerId)];

    if (status) {
      conditions.push(eq(produce.status, status));
    }

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(produce)
      .where(and(...conditions));

    const total = totalCountResult?.count || 0;

    const items = await this.db
      .select()
      .from(produce)
      .where(and(...conditions))
      .orderBy(desc(produce.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },

  /**
   * Retrieves all active produce listings for a specific seller.
   * Useful for dashboard summaries without pagination overhead.
   * @param sellerId - The ID of the seller
   * @returns Array of active produce objects containing only the necessary fields
   */
  async getActiveListingsBySeller(sellerId: string) {
    return await this.db
      .select({ title: produce.title })
      .from(produce)
      .where(and(eq(produce.sellerId, sellerId), eq(produce.status, 'active')));
  },
};
