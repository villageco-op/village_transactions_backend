import { eq, type SQL, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { organizations } from '../db/schema.js';
import type { DbClient, Organization } from '../db/types.js';
import type {
  CreateOrganizationPayload,
  UpdateOrganizationPayload,
} from '../schemas/organization.schema.js';

export const organizationRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves a organization from the database by its ID.
   * @param id - The unique org ID to search for
   * @returns The org object if found, otherwise null
   */
  async findById(id: string): Promise<Organization | null> {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return org ?? null;
  },

  /**
   * Retrieves a organization from the database by its subdomain.
   * @param subdomain - The org subdomain to search for
   * @returns The org object if found, otherwise null
   */
  async findBySubdomain(subdomain: string): Promise<Organization | null> {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.subdomain, subdomain))
      .limit(1);
    return org ?? null;
  },

  /**
   * Creates a new organization.
   * @param data - The organization payload data
   * @returns The created organization
   */
  async create(data: CreateOrganizationPayload): Promise<Organization> {
    const payload = {
      ...data,
      location: sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)`,
    };

    const [org] = await this.db.insert(organizations).values(payload).returning();
    return org;
  },

  /**
   * Update an organizations fields by its Id.
   * @param id - The organization Id
   * @param data - The new fields
   * @returns The updated organization object or null
   */
  async updateById(id: string, data: UpdateOrganizationPayload): Promise<Organization | null> {
    type UpdateSchema = Partial<typeof organizations.$inferInsert>;
    const updatePayload: { [K in keyof UpdateSchema]: UpdateSchema[K] | SQL } = data;

    if (data.lat !== undefined && data.lng !== undefined) {
      updatePayload.location = sql`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)`;
    }

    const [updated] = await this.db
      .update(organizations)
      .set(updatePayload)
      .where(eq(organizations.id, id))
      .returning();

    return updated ?? null;
  },

  /**
   * Delete an organization by its Id.
   * @param id - The organization Id
   * @returns True if the deletion succeded, otherwise false
   */
  async deleteById(id: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(organizations)
      .where(eq(organizations.id, id))
      .returning();
    return !!deleted;
  },
};
