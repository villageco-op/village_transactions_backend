import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import {
  CreateClientSchema,
  ClientResponseSchema,
  GetClientsQuerySchema,
  ClientsListResponseSchema,
  UpdateClientSchema,
  SearchReferrerQuerySchema,
  SearchReferrerResponseSchema,
  GetReferralsQuerySchema,
} from '../schemas/client.schema.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import {
  createClient,
  getClients,
  updateClient,
  deactivateClient,
  deleteClient,
  searchReferrerCandidates,
  getClientReferrals,
} from '../services/client.service.js';

export const clientsRoute = new OpenAPIHono<RouteEnv>();

clientsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createClient',
    description: 'Add a client into the food pantry registry.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateClientSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Client registered successfully',
        content: { 'application/json': { schema: ClientResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;
    const organizationId = authUser?.session?.user?.organizationId;

    if (!userId || !organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'createClient' });

    const result = await createClient(userId, organizationId, payload, log);
    return c.json(result, 201);
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getClients',
    description: 'Search and paginate through the organization clients list.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      query: GetClientsQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated client results match details list',
        content: { 'application/json': { schema: ClientsListResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const query = c.req.valid('query');
    const { limit, offset } = getPaginationParams(query.page, query.limit);
    const log = c.get('logger').child({ action: 'getClients' });

    const result = await getClients(
      organizationId,
      {
        search: query.search,
        active: query.active,
        page: Number(query.page || 1),
        limit,
        offset,
      },
      log,
    );

    return c.json(
      {
        data: result.items,
        meta: {
          total: result.total,
          page: Number(query.page || 1),
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      200,
    );
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/search-referrer',
    operationId: 'searchReferrer',
    description:
      'Searches for referral candidates. Returns a single item if a unique exact match is hit.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      query: SearchReferrerQuerySchema,
    },
    responses: {
      200: {
        description: 'Referrer candidates search payload array',
        content: { 'application/json': { schema: SearchReferrerResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const { q } = c.req.valid('query');
    const log = c.get('logger').child({ action: 'searchReferrer' });

    const result = await searchReferrerCandidates(organizationId, q, log);
    return c.json(result, 200);
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    operationId: 'updateClient',
    description: 'Modify details for an existing registered client profile.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateClientSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Client profile modified successfully',
        content: { 'application/json': { schema: ClientResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Client profile details matching configuration criteria not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const { id } = c.req.valid('param');
    const payload = c.req.valid('json');
    const log = c.get('logger').child({ action: 'updateClient', clientId: id });

    const result = await updateClient(id, organizationId, payload, log);
    return c.json(result, 200);
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/deactivate',
    operationId: 'deactivateClient',
    description: 'Toggle the active status flag of a target client profile to inactive.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Client marked inactive successfully',
        content: { 'application/json': { schema: ClientResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Client target registry profile matches criteria not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const { id } = c.req.valid('param');
    const log = c.get('logger').child({ action: 'deactivateClient', clientId: id });

    const result = await deactivateClient(id, organizationId, log);
    return c.json(result, 200);
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    operationId: 'deleteClient',
    description: 'Completely eliminate target client record parameters permanently.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Client details purged successfully',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Client profile parameters targeted for cleanup not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const { id } = c.req.valid('param');
    const log = c.get('logger').child({ action: 'deleteClient', clientId: id });

    const result = await deleteClient(id, organizationId, log);
    return c.json(result, 200);
  },
);

clientsRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/referrals',
    operationId: 'getClientReferrals',
    description: 'Get a paginated list of clients referred by this client.',
    tags: [TAGS.CLIENTS],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      query: GetReferralsQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated client referrals list',
        content: { 'application/json': { schema: ClientsListResponseSchema } },
      },
      401: {
        description: 'Unauthorized access credentials',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Referrer client not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const organizationId = authUser?.session?.user?.organizationId;

    if (!organizationId) {
      return c.json({ error: 'Unauthorized: Missing organization correlation context' }, 401);
    }

    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    const { limit, offset } = getPaginationParams(query.page, query.limit);
    const log = c.get('logger').child({ action: 'getClientReferrals', referrerId: id });

    const result = await getClientReferrals(
      id,
      organizationId,
      {
        page: Number(query.page || 1),
        limit,
        offset,
      },
      log,
    );

    return c.json(
      {
        data: result.items,
        meta: {
          total: result.total,
          page: Number(query.page || 1),
          limit,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      200,
    );
  },
);
