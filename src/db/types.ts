import type {
  InferSelectModel,
  InferInsertModel,
  InferEnum,
  ExtractTablesWithRelations,
} from 'drizzle-orm';
import type { NeonQueryResultHKT } from 'drizzle-orm/neon-serverless';
import type { PgDatabase, PgTransaction } from 'drizzle-orm/pg-core';

import type * as schema from './schema.js';

export type User = InferSelectModel<typeof schema.users>;
export type NewUser = InferInsertModel<typeof schema.users>;
export type Organization = InferSelectModel<typeof schema.organizations>;
export type NewOrganization = InferInsertModel<typeof schema.organizations>;
export type OrgRole = InferEnum<typeof schema.orgRoleEnum>;
export type OrgType = InferEnum<typeof schema.orgTypeEnum>;
export type OrgInviteStatus = InferEnum<typeof schema.orgInviteStatusEnum>;
export type DbClient = PgDatabase<NeonQueryResultHKT, typeof schema>;
export type DbTransaction = PgTransaction<
  NeonQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export type Subscription = InferSelectModel<typeof schema.subscriptions>;
export type ScheduleType = InferEnum<typeof schema.fulfillmentTypeEnum>;
export type OrderStatus = InferEnum<typeof schema.orderStatusEnum>;
export type ProduceType = InferEnum<typeof schema.produceTypeEnum>;
export type Order = InferSelectModel<typeof schema.orders>;
export type Produce = InferSelectModel<typeof schema.produce>;
export type Invite = InferSelectModel<typeof schema.invites>;
export type NewInvite = InferInsertModel<typeof schema.invites>;
