import type { AdapterAccount } from '@auth/core/adapters';
import {
  pgTable,
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
  varchar,
  unique,
  time,
  primaryKey,
  doublePrecision,
} from 'drizzle-orm/pg-core';

export const produceStatusEnum = pgEnum('produce_status', ['active', 'paused', 'deleted']);
export const paymentMethodEnum = pgEnum('payment_method', ['card', 'snap']);
export const fulfillmentTypeEnum = pgEnum('fulfillment_type', ['pickup', 'delivery']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'completed', 'canceled']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'paused',
  'canceled',
]);

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography';
  },
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified'),
  image: text('image'),

  aboutMe: text('about_me'),
  specialties: jsonb('specialties').$type<string[]>().default([]),
  goal: numeric('goal', { precision: 10, scale: 2 }),

  address: text('address'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  zip: text('zip'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  location: geography('location'),
  deliveryRangeMiles: numeric('delivery_range_miles').default('0'),

  stripeAccountId: text('stripe_account_id').unique(),
  stripeOnboardingComplete: boolean('stripe_onboarding_complete').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').notNull().primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const fcmTokens = pgTable('fcm_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  platform: text('platform').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const scheduleRules = pgTable(
  'schedule_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dayOfWeek: varchar('day_of_week', { length: 10 }).notNull(),
    type: fulfillmentTypeEnum('type').default('pickup'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [unique().on(t.sellerId, t.dayOfWeek, t.startTime, t.endTime)],
);

export const produce = pgTable('produce', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: text('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  produceType: text('produce_type'),
  pricePerOz: numeric('price_per_oz', { precision: 10, scale: 2 }).notNull(),
  totalOzInventory: numeric('total_oz_inventory', { precision: 10, scale: 2 }).notNull(),
  availableBy: timestamp('available_by').defaultNow().notNull(),
  harvestFrequencyDays: integer('harvest_frequency_days').notNull(),
  seasonStart: date('season_start').notNull(),
  seasonEnd: date('season_end').notNull(),
  images: jsonb('images').$type<string[]>().default([]),
  isSubscribable: boolean('is_subscribable').default(false),
  status: produceStatusEnum('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cartReservations = pgTable('cart_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: text('buyer_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => produce.id, { onDelete: 'cascade' }),
  quantityOz: numeric('quantity_oz', { precision: 10, scale: 2 }).notNull(),
  isSubscription: boolean('is_subscription').default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: text('buyer_id')
    .notNull()
    .references(() => users.id),
  sellerId: text('seller_id')
    .notNull()
    .references(() => users.id),
  stripeSessionId: text('stripe_session_id').unique(),
  stripeReceiptUrl: text('stripe_receipt_url'),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  fulfillmentType: fulfillmentTypeEnum('fulfillment_type').notNull(),
  scheduledTime: timestamp('scheduled_time').notNull(),
  status: orderStatusEnum('status').default('pending'),
  cancelReason: text('cancel_reason'),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => produce.id),
  quantityOz: numeric('quantity_oz', { precision: 10, scale: 2 }).notNull(),
  pricePerOz: numeric('price_per_oz', { precision: 10, scale: 2 }).notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerId: text('buyer_id')
    .notNull()
    .references(() => users.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => produce.id),
  stripeSubscriptionId: text('stripe_subscription_id'),
  quantityOz: numeric('quantity_oz', { precision: 10, scale: 2 }).notNull(),
  status: subscriptionStatusEnum('status').default('active'),
  fulfillmentType: fulfillmentTypeEnum('fulfillment_type').notNull(),
  nextDeliveryDate: timestamp('next_delivery_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [unique().on(t.buyerId, t.orderId)],
);
