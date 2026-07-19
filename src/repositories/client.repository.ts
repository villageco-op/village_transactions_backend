import { eq, and, or, sql, desc, ilike, type SQL } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { clients, referrals } from '../db/schema.js';
import type { DbClient } from '../db/types.js';
import type { CreateClientPayload, UpdateClientPayload } from '../schemas/client.schema.js';

export const clientRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the database instance used by the repository.
   * @param newDb - The new database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Get a client by their Id.
   * @param id - The client Id
   * @param orgId - The org the client is part of
   * @returns The client or null
   */
  async findById(id: string, orgId: string) {
    const [client] = await this.db
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)))
      .limit(1);
    return client ?? null;
  },

  /**
   * Look up exact unique matches on fields like email or phone.
   * @param orgId - The organization to search within
   * @param criteria - The search string
   * @returns Up to two exact matching clients
   */
  async findExactMatches(orgId: string, criteria: string) {
    return this.db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, orgId),
          or(eq(clients.email, criteria), eq(clients.phone, criteria)),
        ),
      )
      .limit(2);
  },

  /**
   * Fallback wide match query against name patterns or partial strings.
   * @param orgId - The organization to search within
   * @param searchStr - The search string. Matches against name, email, and phone.
   * @returns Up to 10 possible matching clients
   */
  async findFuzzyCandidates(orgId: string, searchStr: string) {
    return this.db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
      })
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, orgId),
          or(
            ilike(clients.name, `%${searchStr}%`),
            ilike(clients.email, `%${searchStr}%`),
            ilike(clients.phone, `%${searchStr}%`),
          ),
        ),
      )
      .limit(10);
  },

  /**
   * Create a new client within.
   * @param data - Payload containing the new client information
   * @returns The created client
   */
  async create(
    data: Omit<CreateClientPayload, 'referral'> & { organizationId: string; createdById: string },
  ) {
    const [newClient] = await this.db
      .insert(clients)
      .values({
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        organizationId: data.organizationId,
        createdById: data.createdById,
        active: true,
      })
      .returning();
    return newClient;
  },

  /**
   * Create a referral for a new client.
   * @param referrerId - The client making the referral
   * @param referredId - The new client that was referred
   * @returns The new referral
   */
  async createReferral(referrerId: string, referredId: string) {
    const [referralRecord] = await this.db
      .insert(referrals)
      .values({
        referrerId,
        referredId,
      })
      .returning();
    return referralRecord;
  },

  /**
   * Finds who referred a client.
   * @param clientId - The client Id
   * @returns The client that referred them
   */
  async findReferredBy(clientId: string) {
    const [record] = await this.db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        phone: clients.phone,
      })
      .from(referrals)
      .innerJoin(clients, eq(referrals.referrerId, clients.id))
      .where(eq(referrals.referredId, clientId))
      .limit(1);
    return record ?? null;
  },

  /**
   * Update a client.
   * @param id - The client Id
   * @param orgId - The clients organization Id
   * @param data - The new client information
   * @returns The updated client or null
   */
  async update(id: string, orgId: string, data: UpdateClientPayload) {
    const [updated] = await this.db
      .update(clients)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)))
      .returning();
    return updated ?? null;
  },

  /**
   * Set the active status of a client.
   * @param id - The client Id
   * @param orgId - The organization Id
   * @param active - The new status
   * @returns The updated client or null
   */
  async setActiveStatus(id: string, orgId: string, active: boolean) {
    const [updated] = await this.db
      .update(clients)
      .set({
        active,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)))
      .returning();
    return updated ?? null;
  },

  /**
   * Delete a client.
   * @param id - The client Id
   * @param orgId - The organization Id
   * @returns True if deleted
   */
  async delete(id: string, orgId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(clients)
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)))
      .returning();
    return !!deleted;
  },

  /**
   * Get a list of clients within an organization.
   * @param params - Parameters for filtering and pagination
   * @param params.orgId - The clients organization
   * @param params.search - A search string
   * @param params.active - Filter by active status
   * @param params.limit - Max number of results
   * @param params.offset - The offset index to start at
   * @returns A list of clients
   */
  async getList(params: {
    orgId: string;
    search?: string;
    active?: boolean;
    limit: number;
    offset: number;
  }) {
    const { orgId, search, active, limit, offset } = params;
    const conditions: SQL[] = [eq(clients.organizationId, orgId)];

    if (active !== undefined) {
      conditions.push(eq(clients.active, active));
    }

    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.email, `%${search}%`),
          ilike(clients.phone, `%${search}%`),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [totalResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(clients)
      .where(whereClause);

    const total = totalResult?.count || 0;

    const items = await this.db
      .select()
      .from(clients)
      .where(whereClause)
      .orderBy(desc(clients.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
};
