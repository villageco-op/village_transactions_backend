import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';

import path from 'path';
import fs from 'fs';

import * as schema from '../../src/db/schema.js';

/**
 * Initializes an in-memory LibSQL/SQLite database and runs pending migrations.
 * @returns An initialized Drizzle database instance
 * @throws Error if the migrations folder is missing
 */
export async function createTestDb() {
  const migrationsFolder = path.join(process.cwd(), 'drizzle');

  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Migration folder not found at ${migrationsFolder}`);
  }

  const client = createClient({ url: 'file::memory:' });
  const db = drizzle(client, { schema });

  try {
    await migrate(db, { migrationsFolder });
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }

  return db;
}
