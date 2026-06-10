import { AsyncLocalStorage } from 'node:async_hooks';

import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

if (typeof window === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

export const dbContext = new AsyncLocalStorage();

const globalPool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseDb = drizzle(globalPool);

export const db = new Proxy(baseDb, {
  get(target, prop, receiver) {
    const activeDb = dbContext.getStore() ?? target;
    const value = Reflect.get(activeDb, prop, receiver);
    return typeof value === 'function' ? value.bind(activeDb) : value;
  },
});
