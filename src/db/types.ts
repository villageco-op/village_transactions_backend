import type { InferSelectModel, InferInsertModel, InferEnum } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

import type * as schema from './schema.js';

export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;
export type DbClient = NeonHttpDatabase<typeof schema>;
export type Subscription = InferSelectModel<typeof schema.subscriptions>;
export type ScheduleType = InferEnum<typeof schema.fulfillmentTypeEnum>;
export type OrderStatus = InferEnum<typeof schema.orderStatusEnum>;
export type ProduceType = InferEnum<typeof schema.produceTypeEnum>;
