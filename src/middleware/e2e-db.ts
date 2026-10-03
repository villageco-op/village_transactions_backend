import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { createMiddleware } from 'hono/factory';

import { dbContext } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { DbClient } from '../db/types.js';

const e2ePools = new Map<string, DbClient>();

export const e2eDbMiddleware = createMiddleware(async (c, next) => {
  const e2eDbUrl = c.req.header('x-e2e-neon-db-url');
  const isPreview = process.env.VERCEL_ENV === 'preview';

  if (e2eDbUrl && isPreview) {
    if (!e2ePools.has(e2eDbUrl)) {
      const e2ePool = new Pool({ connectionString: e2eDbUrl });
      e2ePools.set(e2eDbUrl, drizzle(e2ePool, { schema }));
    }

    const scopedDb = e2ePools.get(e2eDbUrl);

    if (scopedDb) {
      return dbContext.run(scopedDb, () => next());
    }
  }

  await next();
});
