import {
  pgTable,
  serial,
  text,
  customType,
  timestamp,
  numeric,
  boolean,
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

  fcmToken: text('fcm_token'),
  fcmPlatform: text('fcm_platform'),
});
