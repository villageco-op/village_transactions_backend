import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

import type { users } from './schema.js';
import type * as schema from './schema.js';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type DbClient = NeonHttpDatabase<typeof schema>;
