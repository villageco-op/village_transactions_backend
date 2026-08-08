import { eq, and, lt, desc, gte, sql } from 'drizzle-orm';

import { db as defaultDb } from '../db/index.js';
import { invites } from '../db/schema.js';
import type { DbClient, Invite, NewInvite, OrgInviteStatus } from '../db/types.js';

export const inviteRepository = {
  db: defaultDb as unknown as DbClient,

  /**
   * Updates the default database instance used by the repository.
   * @param newDb - The database connection or mock instance
   */
  setDb(newDb: DbClient) {
    this.db = newDb;
  },

  /**
   * Retrieves an invitation by its unique ID.
   * @param id - The organization Id
   * @returns The invite or null
   */
  async findById(id: string): Promise<Invite | null> {
    const [invite] = await this.db.select().from(invites).where(eq(invites.id, id)).limit(1);
    return invite ?? null;
  },

  /**
   * Retrieves an invitation matching email, code, and organization ID.
   * @param email - The email the invite was sent to
   * @param code - The invite code
   * @param orgId - The organization Id
   * @returns The invite or null
   */
  async findValidInvite(email: string, code: string, orgId: string): Promise<Invite | null> {
    const [invite] = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.email, email), eq(invites.code, code), eq(invites.orgId, orgId)))
      .limit(1);
    return invite ?? null;
  },

  /**
   * Creates or updates an invitation record for a given email and organization.
   * @param data - The new invite fields
   * @returns The created or updated invite record
   */
  async upsert(data: NewInvite): Promise<Invite> {
    const [invite] = await this.db
      .insert(invites)
      .values(data)
      .onConflictDoUpdate({
        target: [invites.email, invites.orgId],
        set: {
          id: data.id,
          code: data.code,
          role: data.role,
          expiresAt: data.expiresAt,
        },
      })
      .returning();
    return invite;
  },

  /**
   * Deletes an invitation by its unique ID.
   * @param id - The organization Id
   * @returns True if the organization was deleted
   */
  async deleteById(id: string): Promise<boolean> {
    const [deleted] = await this.db.delete(invites).where(eq(invites.id, id)).returning();
    return !!deleted;
  },

  /**
   * Deletes all outdated invitations.
   * @param now - The current date
   * @returns The number of deleted invites
   */
  async deleteExpired(now: Date): Promise<number> {
    const result = await this.db.delete(invites).where(lt(invites.expiresAt, now));
    return result.rowCount ?? 0;
  },

  /**
   * Updates the status and code for an invitation.
   * @param id - The invite Id
   * @param status - The new status
   * @param code - The new code (null clears it)
   * @returns The updated invite
   */
  async updateStatusAndCode(
    id: string,
    status: OrgInviteStatus,
    code: string | null,
  ): Promise<Invite | null> {
    const [updated] = await this.db
      .update(invites)
      .set({ status, code })
      .where(eq(invites.id, id))
      .returning();
    return updated ?? null;
  },

  /**
   * Gets a list of invites for an organization.
   * @param params - Search parameters
   * @param params.orgId - The organization Id
   * @param params.status - Filter by status
   * @param params.limit - Max number of invites
   * @param params.offset - The start index
   * @returns A list of invites and the total
   */
  async getList(params: {
    orgId: string;
    status?: OrgInviteStatus;
    limit: number;
    offset: number;
  }) {
    const { orgId, status, limit, offset } = params;
    const conditions = [eq(invites.orgId, orgId)];

    if (status) {
      const now = new Date();
      if (status === 'expired') {
        conditions.push(eq(invites.status, 'pending'));
        conditions.push(lt(invites.expiresAt, now));
      } else if (status === 'pending') {
        conditions.push(eq(invites.status, 'pending'));
        conditions.push(gte(invites.expiresAt, now));
      } else {
        conditions.push(eq(invites.status, status));
      }
    }

    const whereClause = and(...conditions);

    const [totalCountResult] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(invites)
      .where(whereClause);

    const total = totalCountResult?.count || 0;

    const items = await this.db
      .select()
      .from(invites)
      .where(whereClause)
      .orderBy(desc(invites.createdAt))
      .limit(limit)
      .offset(offset);

    const mappedItems = items.map((item) => {
      let currentStatus = item.status;
      if (item.status === 'pending' && new Date() > item.expiresAt) {
        currentStatus = 'expired';
      }
      return {
        ...item,
        status: currentStatus,
      };
    });

    return { items: mappedItems, total };
  },

  /**
   * TESTING ONLY: Retrieves the most recent invite code record for a specific email and organization.
   * @param email - Target invited user email
   * @param orgId - Target organization ID
   * @returns The invite record details or null
   */
  async findLatestTestInvite(email: string, orgId: string): Promise<Invite | null> {
    const [invite] = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.email, email), eq(invites.orgId, orgId)))
      .orderBy(desc(invites.expiresAt))
      .limit(1);

    return invite ?? null;
  },
};
