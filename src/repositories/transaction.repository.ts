import { db as defaultDb } from '../db/index.js';
import type { DbClient } from '../db/types.js';

export const transactionRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used for transactions.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Runs an array of operations sequentially inside a single transaction.
   * @param operations - The repository functions to run
   * @returns An array of the operation results
   */
  async run<T extends unknown[]>(
    operations: [...{ [K in keyof T]: () => Promise<T[K]> }],
  ): Promise<T> {
    return await this.db.transaction(async () => {
      const results = [] as unknown as T;
      for (const op of operations) {
        results.push(await op());
      }
      return results;
    });
  },
};
