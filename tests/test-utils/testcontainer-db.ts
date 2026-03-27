import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';

let container: any;
let pool: pg.Pool;

/**
 * Spins up a Docker container with PostgreSQL/PostGIS and applies migrations.
 * @returns A Drizzle instance connected to the temporary container
 */
export async function createTestDb() {
  const POSTGRES_IMAGE = process.env.POSTGRES_IMAGE || 'postgis/postgis:17-3.6-alpine';
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  const db = drizzle(pool);

  await pool.query('SELECT postgis_full_version();');

  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });

  return db;
}

/**
 * Gracefully shuts down the database connection pool and stops the Docker container.
 * @returns Promise that resolves when the teardown is complete
 */
export async function closeTestDb() {
  if (pool) await pool.end();
  if (container) await container.stop();
}

/**
 * Resets specific database tables by truncating and restarting identity sequences.
 * @param db - The Drizzle database instance
 * @returns Promise that resolves when truncation is complete
 */
export async function truncateTables(db: any) {
  await db.execute(`TRUNCATE TABLE users RESTART IDENTITY CASCADE;`);
}
