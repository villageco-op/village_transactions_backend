import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { resend } from '../lib/resend.js';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common.schema.js';
import { AcceptInviteSchema, CreateInviteSchema } from '../schemas/invite.schema.js';
import { createOrgInvite, acceptOrgInvite } from '../services/invite.service.js';

export const invitesRoute = new OpenAPIHono<RouteEnv>();

invitesRoute.openapi(
  createRoute({
    method: 'post',
    path: '/invite',
    operationId: 'inviteToOrg',
    description: 'Invite a user to the organization by email.',
    tags: [TAGS.ORGANIZATIONS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateInviteSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Invitation sent successfully',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      400: {
        description: 'Caller is not associated with an organization or missing information',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized caller',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      502: {
        description: 'Failing email transmission service error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const callerUserId = authUser?.session?.user?.id;
    if (!callerUserId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'inviteToOrg' });

    const result = await createOrgInvite(resend, callerUserId, payload, log);

    return c.json(result, 200);
  },
);

invitesRoute.openapi(
  createRoute({
    method: 'post',
    path: '/accept',
    operationId: 'acceptInvite',
    description: 'Accept an invitation and update user profile roles.',
    tags: [TAGS.ORGANIZATIONS],
    request: {
      body: {
        content: {
          'application/json': {
            schema: AcceptInviteSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Invitation accepted and account configurations updated',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      400: {
        description: 'Invalid parameters, mismatched values or expired invite record',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Target profile not registered',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'acceptInvite' });

    const result = await acceptOrgInvite(payload, log);
    return c.json(result, 200);
  },
);
