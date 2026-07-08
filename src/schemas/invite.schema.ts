import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { invites } from '../db/schema.js';

import {
  EntityIdField,
  OrgInviteStatusSchema,
  OrgRoleSchema,
  PaginationQuerySchema,
} from './common.schema.js';

export const BaseInviteSchema = createSelectSchema(invites).openapi('Invite');

export const CreateInviteSchema = z
  .object({
    email: z.string().email().openapi({ example: 'colleague@example.com' }),
    role: OrgRoleSchema.default('member'),
  })
  .openapi('CreateInvitePayload');

export const AcceptInviteSchema = z
  .object({
    email: z.string().email().openapi({ example: 'colleague@example.com' }),
    code: z.string().openapi({ example: 'a1b2c3d4e5f6' }),
    orgId: EntityIdField.openapi({ example: 'org_12345' }),
  })
  .openapi('AcceptInvitePayload');

export const GetInvitesQuerySchema = z
  .object({
    status: OrgInviteStatusSchema.optional().openapi({
      description: 'Filter invites by status',
    }),
  })
  .extend(PaginationQuerySchema.shape)
  .openapi('GetInvitesQuery');

export const InvitesListResponseSchema = z
  .object({
    data: z.array(BaseInviteSchema),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  })
  .openapi('InvitesListResponse');
