import {
  pgTable,
  serial,
  text,
  customType,
  timestamp,
  numeric,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  uuid,
} from 'drizzle-orm/pg-core';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography';
  },
});

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  coordinates: geography('coordinates').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  passwordHash: text('password_hash'),

  address: text('address'),
  location: geography('location'),
  deliveryRangeMiles: numeric('delivery_range_miles').default('0'),

  stripeAccountId: text('stripe_account_id').unique(),
  stripeOnboardingComplete: boolean('stripe_onboarding_complete').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const fcmTokens = pgTable('fcm_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const produceStatusEnum = pgEnum('produce_status', ['active', 'paused', 'deleted']);

export const produce = pgTable('produce', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: text('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  produceType: text('produce_type'),
  pricePerOz: numeric('price_per_oz', { precision: 10, scale: 2 }).notNull(),
  totalOzInventory: numeric('total_oz_inventory', { precision: 10, scale: 2 }).notNull(),
  harvestFrequencyDays: integer('harvest_frequency_days').notNull(),
  seasonStart: date('season_start').notNull(),
  seasonEnd: date('season_end').notNull(),
  images: jsonb('images').$type<string[]>().default([]),
  isSubscribable: boolean('is_subscribable').default(false),
  status: produceStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
