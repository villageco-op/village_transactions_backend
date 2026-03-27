import { and, eq } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { produce } from '../db/schema.js';
import type { DbClient } from '../db/types.js';
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
    const { pricePerOz, totalOzInventory, ...remainingData } = data;

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
};
