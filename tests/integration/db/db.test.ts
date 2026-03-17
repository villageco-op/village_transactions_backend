import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '../../../src/db';

describe('Database Connection', () => {
  it('should successfully connect to Neon and return a result', async () => {
    const result = await db.execute(sql`SELECT 1 as alive`);
    expect(result.rows[0]).toEqual({ alive: 1 });
  });
});
