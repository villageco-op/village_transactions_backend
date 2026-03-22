import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';

let container: any;
let testPool: pg.Pool;

/**
 * Spins up a global PostgreSQL Testcontainer, runs PostGIS verification,
 * and executes Drizzle migrations.
 * @returns A Promise resolving to the connection URI string for the container.
 */
export async function startGlobalContainer() {
  const POSTGRES_IMAGE = process.env.POSTGRES_IMAGE || 'postgis/postgis:17-3.6-alpine';
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

  const uri = container.getConnectionUri();

  const setupPool = new pg.Pool({ connectionString: uri });
  const db = drizzle(setupPool);

  await setupPool.query('SELECT postgis_full_version();');
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });

  await setupPool.end();

  return uri;
}

/**
 * Gracefully shuts down the global PostgreSQL Testcontainer.
 * @returns A Promise that resolves when the container has stopped.
 */
export async function stopGlobalContainer() {
  if (container) await container.stop();
}

/**
 * Initializes or retrieves an existing Drizzle database instance for testing.
 * @throws {Error} If `TEST_DB_URL` environment variable is not set.
 * @returns An initialized Drizzle database client.
 */
export function getTestDb() {
  if (!process.env.TEST_DB_URL) {
    throw new Error('TEST_DB_URL is not set. Is the global setup running?');
  }

  if (!testPool) {
    testPool = new pg.Pool({ connectionString: process.env.TEST_DB_URL });
  }

  return drizzle(testPool);
}

/**
 * Closes the active database connection pool used by the tests.
 * @remarks
 * Use this in an `afterAll` hook to prevent memory leaks or
 * hanging processes after tests complete.
 */
export async function closeTestDbConnection() {
  if (testPool) {
    await testPool.end();
    testPool = undefined as any;
  }
}

/**
 * Resets specific database tables to a clean state.
 * @param db - The Drizzle database instance to execute the truncation on.
 * @remarks
 * This uses `RESTART IDENTITY CASCADE` to reset primary key sequences
 * and handle foreign key dependencies for the users, produce, and cart_reservations tables.
 * IMPORTANT: As tables are created, add them here to ensure they get reset.
 */
export async function truncateTables(db: any) {
  await db.execute(`
    TRUNCATE TABLE 
      users, 
      produce, 
      cart_reservations, 
      schedule_rules, 
      orders, 
      order_items, 
      subscriptions 
    RESTART IDENTITY CASCADE;
  `);
}
