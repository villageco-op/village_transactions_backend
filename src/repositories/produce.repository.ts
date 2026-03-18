import { db as defaultDb } from '../db/index.js';
import { produce } from '../db/schema.js';
import type { DbClient } from '../db/types.js';
import type { CreateProducePayload } from '../schemas/produce.schema.js';

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
};
