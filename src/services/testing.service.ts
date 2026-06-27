import { encode } from '@auth/core/jwt';
import { HTTPException } from 'hono/http-exception';

import type { AppLogger } from '../interfaces/logger.interface.js';
import { inviteRepository } from '../repositories/invite.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { produceRepository } from '../repositories/produce.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { CreateOrganizationPayload } from '../schemas/organization.schema.js';
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

/**
 * TESTING ONLY: Forcefully inserts or sets up an organization for E2E testing.
 * @param payload - Partial organization payload data matching CreateOrganizationPayload
 * @param log - App logger
 * @returns The created organization record
 */
export async function seedTestOrganization(
  payload: Partial<CreateOrganizationPayload> & { name: string; subdomain: string },
  log: AppLogger,
) {
  log.info({ subdomain: payload.subdomain }, 'Seeding e2e test organization profile');

  const fallbackOrgData: CreateOrganizationPayload = {
    name: payload.name,
    type: payload.type ?? 'pantry',
    address: payload.address ?? '123 Test St',
    city: payload.city ?? 'Madison',
    state: payload.state ?? 'WI',
    country: payload.country ?? 'United States',
    zip: payload.zip ?? '53703',
    lat: payload.lat ?? 43.0731,
    lng: payload.lng ?? -89.4012,
    subdomain: payload.subdomain,
    email: payload.email ?? 'test@example.org',
    website: payload.website ?? 'https://example.org',
    phone: payload.phone ?? '+16085550199',
    image: payload.image ?? undefined,
  };

  return await organizationRepository.create(fallbackOrgData);
}

/**
 * TESTING ONLY: Fetches the invite code tracking record using clean repository layers.
 * @param email - Target invited user email
 * @param orgId - Target organization ID
 * @param log - App logger
 * @returns The invite record details or null
 */
export async function getTestLatestInviteCode(email: string, orgId: string, log: AppLogger) {
  log.info({ email, orgId }, 'Retrieving latest test invite code context via repository');

  return await inviteRepository.findLatestTestInvite(email, orgId);
}
