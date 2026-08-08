import { AsyncLocalStorage } from 'node:async_hooks';

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as schema from '../db/schema.js';

import type { DbClient, DbTransaction } from './types.js';

if (typeof window === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

type ContextDb = DbClient | DbTransaction;

export const dbContext = new AsyncLocalStorage<ContextDb>();

const globalPool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseDb = drizzle(globalPool, { schema });

export const db = new Proxy(baseDb, {
  get(target, prop, receiver) {
    const activeDb = dbContext.getStore() ?? target;

    if (prop === 'transaction') {
      return <T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> => {
        return (activeDb as DbClient).transaction(async (tx) => {
          return dbContext.run(tx as ContextDb, () => callback(tx));
        });
      };
    }

    const value = Reflect.get(activeDb, prop, receiver);
    return typeof value === 'function' ? value.bind(activeDb) : value;
  },
}) as DbClient;
