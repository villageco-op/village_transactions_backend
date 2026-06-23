import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

import { invites } from '../db/schema.js';

import { EntityIdField, OrgRoleSchema } from './common.schema.js';

export const BaseInviteSchema = createSelectSchema(invites);

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
