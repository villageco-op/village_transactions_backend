import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common.schema.js';
import {
  CheckSubdomainQuerySchema,
  CheckSubdomainResponseSchema,
  CreateOrganizationSchema,
  OrganizationSchema,
  UpdateOrganizationSchema,
} from '../schemas/organization.schema.js';
import {
  checkSubdomainAvailability,
  createOrganization,
  deleteOrganization,
  updateOrganization,
} from '../services/organization.service.js';

export const organizationsRoute = new OpenAPIHono<RouteEnv>();

organizationsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/subdomain/check',
    operationId: 'checkSubdomain',
    description: 'Check if a subdomain is available, and get an alternative suggestion if not.',
    tags: [TAGS.ORGANIZATIONS],
    request: {
      query: CheckSubdomainQuerySchema,
    },
    responses: {
      200: {
        description: 'Subdomain availability check result',
        content: { 'application/json': { schema: CheckSubdomainResponseSchema } },
      },
      400: {
        description: 'Invalid subdomain format',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { subdomain } = c.req.valid('query');
    const result = await checkSubdomainAvailability(subdomain);
    return c.json(result, 200);
  },
);

organizationsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createOrganization',
    description: 'Create a new Organization account.',
    tags: [TAGS.ORGANIZATIONS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateOrganizationSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Organization created successfully',
        content: { 'application/json': { schema: OrganizationSchema } },
      },
      400: {
        description: 'Bad request or validation error',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized user context',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      409: {
        description: 'Conflict: Subdomain or email already in use',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    console.log('Creating a repository!');
    const authUser = c.get('authUser');
    if (!authUser?.session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'createOrganization' });

    const newOrg = await createOrganization(payload, log);
    return c.json(newOrg, 201);
  },
);

organizationsRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    operationId: 'updateOrganization',
    description:
      'Update physical address, type, subdomain, or profile information of an organization.',
    tags: [TAGS.ORGANIZATIONS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateOrganizationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization updated successfully',
        content: { 'application/json': { schema: OrganizationSchema } },
      },
      400: {
        description: 'Incomplete coordinate variables provided',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized user context',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Organization target not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      409: {
        description: 'Subdomain already in use',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser?.session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { id } = c.req.valid('param');
    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'updateOrganization', orgId: id });

    const updatedOrg = await updateOrganization(id, payload, log);
    return c.json(updatedOrg, 200);
  },
);

organizationsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    operationId: 'deleteOrganization',
    description: 'Delete an organization and clean up associated assets.',
    tags: [TAGS.ORGANIZATIONS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Organization deleted successfully',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized user context',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Organization target not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    if (!authUser?.session?.user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { id } = c.req.valid('param');
    const log = c.get('logger').child({ action: 'deleteOrganization', orgId: id });

    await deleteOrganization(id, log);
    return c.json({ success: true }, 200);
  },
);
