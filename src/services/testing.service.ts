import { encode } from '@auth/core/jwt';
import { HTTPException } from 'hono/http-exception';

import type { AppLogger } from '../interfaces/logger.interface.js';
import { produceRepository } from '../repositories/produce.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { CreateProducePayload } from '../schemas/produce.schema.js';
import { cookieName } from '../utils.js';

/**
 * Creates a user profile directly in the database with custom attributes.
 * @param payload - The user data
 * @param payload.email - The user email
 * @param payload.stripeOnboarded - Did the user complete Stripe onboarding
 * @param payload.profile - The user name and address
 * @param payload.profile.name - The users name
 * @param payload.profile.address - The users address
 * @param payload.profile.city - The users city
 * @param payload.profile.state - The users state
 * @param payload.profile.zip - The users zip code
 * @param log - App logger that defaults to a blank logger
 * @returns The database user object
 */
export async function seedTestUser(
  payload: {
    email: string;
    stripeOnboarded: boolean;
    profile?: { name: string; address: string; city: string; state: string; zip: string };
  },
  log: AppLogger,
) {
  log.info({ email: payload.email }, 'Seeding e2e test user profile');

  let stripeAccountId: string | null = null;

  if (payload.stripeOnboarded) {
    stripeAccountId = process.env.STRIPE_TEST_SELLER_ACCOUNT_ID || null;
    log.info({ stripeAccountId }, 'Using permanent static Stripe test account for E2E');
    if (!stripeAccountId)
      log.warn(
        'Missing STRIPE_TEST_SELLER_ACCOUNT_ID. Creating a Stripe onboarded test user without a stripeAccountId!',
      );
  }

  return await userRepository.seedUser({
    email: payload.email,
    name: payload.profile?.name,
    stripeOnboarded: payload.stripeOnboarded,
    stripeAccountId,
    profile: payload.profile,
  });
}

/**
 * Encrypts a fake JWT payload using Auth.js utilities to produce an authentic session cookie value.
 * @param email - The users email
 * @returns The encrypted token
 */
export async function generateAuthJsCookieValue(email: string): Promise<string> {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new HTTPException(404, { message: 'Cannot authenticate non-existent user: ${email}' });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new HTTPException(500, {
      message: 'AUTH_SECRET environment variable is missing; cannot sign test sessions.',
    });
  }

  const tokenPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.image,
    stripeOnboardingComplete: user.stripeOnboardingComplete,
  };

  const maxAge = 30 * 24 * 60 * 60;

  const encryptedToken = await encode({
    token: tokenPayload,
    secret,
    maxAge,
    salt: cookieName,
  });

  return encryptedToken;
}

/**
 * TESTING ONLY: Forcefully inserts a produce listing under an existing user's email.
 * @param payload - The produce data
 * @param payload.email - The owning users email
 * @param payload.produce - The create produce payload
 * @param log - App logger that defaults to a blank logger
 * @returns The newly created produce record
 */
export async function seedTestProduce(
  payload: {
    email: string;
    produce: Partial<CreateProducePayload>;
  },
  log: AppLogger,
) {
  log.info({ email: payload.email }, 'Seeding e2e test produce listing');

  const user = await userRepository.findByEmail(payload.email);
  if (!user) {
    throw new HTTPException(404, {
      message: 'Cannot seed produce for non-existent user: ${payload.email}',
    });
  }

  const fallbackProduceData: CreateProducePayload = {
    title: payload.produce.title ?? 'Test Organic Strawberries',
    description: payload.produce.description ?? 'Freshly seeded test strawberries.',
    produceType: payload.produce.produceType ?? 'nightshades',
    pricePerOz: payload.produce.pricePerOz ?? 0.5,
    totalOzInventory: payload.produce.totalOzInventory ?? 160.0,
    maxOrderQuantityOz: payload.produce.maxOrderQuantityOz ?? 32.0,
    availableBy: payload.produce.availableBy ?? new Date(),
    harvestFrequencyDays: payload.produce.harvestFrequencyDays ?? 7,
    seasonStart: payload.produce.seasonStart ?? '2026-01-01',
    seasonEnd: payload.produce.seasonEnd ?? '2026-12-31',
    images: payload.produce.images ?? [],
    isSubscribable: payload.produce.isSubscribable ?? false,
  };

  return await produceRepository.create(user.id, fallbackProduceData);
}
