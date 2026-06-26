import { randomUUID } from 'crypto';

import { eq, type SQL, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { users } from '../db/schema.js';
import type { DbClient, OrgRole, User } from '../db/types.js';
import type { UpdateUserPayload } from '../schemas/user.schema.js';

export const userRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves a user from the database by their email address.
   * @param email - The unique email address to search for
   * @returns The user object if found, otherwise null
   */
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    return user ?? null;
  },

  /**
   * Retrieves a user from the database by their ID.
   * @param id - The unique user ID to search for
   * @returns The user object if found, otherwise null
   */
  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  },

  /**
   * Updates a user's profile information by their ID.
   * @param id - The unique user ID to update
   * @param data - The update payload (handles extracting lat/lng to a PostGIS point)
   * @returns The updated user object if found, otherwise null
   */
  async updateById(id: string, data: UpdateUserPayload): Promise<User | null> {
    type UpdateSchema = Partial<typeof users.$inferInsert>;
    const updatePayload: { [K in keyof UpdateSchema]: UpdateSchema[K] | SQL } = {};

    if (data.name !== undefined) updatePayload.name = data.name;

    if (data.image !== undefined) updatePayload.image = data.image;
    if (data.aboutMe !== undefined) updatePayload.aboutMe = data.aboutMe;
    if (data.specialties !== undefined) updatePayload.specialties = data.specialties;

    if (data.goal !== undefined) {
      updatePayload.goal = data.goal.toString();
    }
    if (data.deliveryRangeMiles !== undefined) {
      updatePayload.deliveryRangeMiles = data.deliveryRangeMiles.toString();
    }

    const isUpdatingLocation =
      data.address !== undefined ||
      data.city !== undefined ||
      data.lat !== undefined ||
      data.lng !== undefined ||
      data.state !== undefined ||
      data.country !== undefined ||
      data.zip !== undefined;

    if (isUpdatingLocation) {
      if (
        data.address === undefined ||
        data.city === undefined ||
        data.lat === undefined ||
        data.lng === undefined ||
        data.state === undefined ||
        data.country === undefined ||
        data.zip === undefined
      ) {
        throw new Error(
          'Address, city, lat, and lng must all be provided together to update location.',
        );
      }

      updatePayload.address = data.address;
      updatePayload.city = data.city;
      updatePayload.lat = data.lat;
      updatePayload.lng = data.lng;
      updatePayload.state = data.state;
      updatePayload.country = data.country;
      updatePayload.zip = data.zip;
      updatePayload.location = sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)`;
    }

    updatePayload.updatedAt = sql`now()`;

    const [updatedUser] = await this.db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, id))
      .returning();

    return updatedUser ?? null;
  },

  /**
   * Updates a user's internal Stripe Account ID.
   * @param id - The unique user ID
   * @param stripeAccountId - The generated Stripe Account ID
   * @returns The updated user object if found, otherwise null
   */
  async updateStripeAccountId(id: string, stripeAccountId: string): Promise<User | null> {
    const [updatedUser] = await this.db
      .update(users)
      .set({
        stripeAccountId,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, id))
      .returning();

    return updatedUser ?? null;
  },

  /**
   * Updates a user's Stripe Onboarding Complete status by their Stripe Account ID.
   * @param stripeAccountId - The generated Stripe Account ID
   * @param isComplete - Whether the onboarding is successfully complete
   */
  async updateStripeOnboardingStatus(stripeAccountId: string, isComplete: boolean): Promise<void> {
    await this.db
      .update(users)
      .set({
        stripeOnboardingComplete: isComplete,
        updatedAt: sql`now()`,
      })
      .where(eq(users.stripeAccountId, stripeAccountId));
  },

  /**
   * Associates the user with an organization and assigns their organization role.
   * @param userId - The user Id
   * @param organizationId - The organization Id
   * @param role - The users assigned organization role
   * @returns The updated user or null
   */
  async updateOrgAndRole(
    userId: string,
    organizationId: string,
    role: OrgRole,
  ): Promise<User | null> {
    const [updated] = await this.db
      .update(users)
      .set({
        organizationId,
        orgRole: role,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated ?? null;
  },

  /**
   * Clears the organization ID and role for all users associated with a specific organization ID.
   * @param organizationId - The ID of the organization being disassociated
   */
  async clearOrganizationFromUsers(organizationId: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        organizationId: null,
        orgRole: null,
      })
      .where(eq(users.organizationId, organizationId));
  },

  /**
   * Anonymizes a user's profile to act as a soft delete while maintaining
   * foreign key integrity for past orders and order items.
   * @param id - The unique user ID to anonymize
   */
  async anonymize(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        name: 'Deleted User',
        email: `deleted-${id}@example.local`,
        emailVerified: null,
        image: null,
        organizationId: null,
        orgRole: null,
        aboutMe: null,
        specialties: [],
        goal: null,
        address: null,
        city: null,
        state: null,
        country: null,
        zip: null,
        lat: null,
        lng: null,
        location: null,
        deliveryRangeMiles: '0',
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, id));
  },

  /**
   * TESTING ONLY: Forcefully inserts a completely pre-configured test user.
   * @param data Payload to structure the new seeded user record
   * @param data.email - The user email
   * @param data.name - The users name
   * @param data.stripeOnboarded - Did the user complete Stripe onboarding
   * @param data.stripeAccountId - The users Stripe account id
   * @param data.profile - The user name and address
   * @param data.profile.address - The users address
   * @param data.profile.city - The users city
   * @param data.profile.state - The users state
   * @param data.profile.zip - The users zip code
   * @param data.profile.country - The users country
   * @param data.profile.lat - The users latitude
   * @param data.profile.lng - The users longitude
   * @returns The user entry
   */
  async seedUser(data: {
    email: string;
    name?: string;
    stripeOnboarded?: boolean;
    stripeAccountId?: string | null;
    profile?: {
      address: string;
      city: string;
      state: string;
      zip: string;
      country?: string;
      lat?: number;
      lng?: number;
    };
  }): Promise<User> {
    const id = `test_usr_${randomUUID()}`;
    const lat = data.profile?.lat ?? 30.2672;
    const lng = data.profile?.lng ?? -97.7431;

    const insertPayload: typeof users.$inferInsert = {
      id,
      email: data.email,
      name: data.name ?? 'Test User',
      emailVerified: new Date(),
      address: data.profile?.address ?? null,
      city: data.profile?.city ?? null,
      state: data.profile?.state ?? null,
      country: data.profile?.country ?? 'USA',
      zip: data.profile?.zip ?? null,
      lat,
      lng,
      location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)` as unknown as string,
      stripeAccountId: data.stripeAccountId ?? null,
      stripeOnboardingComplete: data.stripeOnboarded ?? false,
    };

    const query = insertPayload.stripeAccountId
      ? this.db
          .insert(users)
          .values(insertPayload)
          .onConflictDoUpdate({
            target: users.stripeAccountId,
            set: {
              email: insertPayload.email,
              name: insertPayload.name,
              stripeOnboardingComplete: insertPayload.stripeOnboardingComplete,
            },
          })
      : this.db.insert(users).values(insertPayload);

    const [newUser] = await query.returning();

    if (!newUser) {
      throw new Error('Failed to seed user into test database.');
    }

    return newUser;
  },
};
