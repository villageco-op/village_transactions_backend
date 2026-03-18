import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import { CreateProduceSchema } from '../schemas/produce.schema.js';
import { createProduceListing } from '../services/produce.service.js';

export const produceRoute = new OpenAPIHono();

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/map',
    operationId: 'getProduceMap',
    description: 'See sellers on a map.',
    request: {
      query: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        radiusMiles: z.coerce.number().optional(),
        produceType: z.string().optional(),
        hasDelivery: z.enum(['true', 'false']).optional(),
        maxPrice: z.coerce.number().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Map items',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Get data and call get produce map service.
  (c) => c.json([], 200),
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/list',
    operationId: 'getProduceList',
    description: 'See list of produce/sellers.',
    request: {
      query: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        sortBy: z.enum(['distance', 'price']).optional(),
        hasDelivery: z.enum(['true', 'false']).optional(),
        limit: z.coerce.number().default(20),
        offset: z.coerce.number().default(0),
      }),
    },
    responses: {
      200: {
        description: 'List of produce',
        content: { 'application/json': { schema: z.array(z.any()) } },
      },
    },
  }),
  // TODO: [Service] Get data and call get produce list service.
  (c) => c.json([], 200),
);

produceRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createProduce',
    description: 'Create a new produce listing.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateProduceSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Listing created',
        content: { 'application/json': { schema: z.object({ id: z.string() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      500: {
        description: 'Server Error',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = c.req.valid('json');

    const newProduce = await createProduceListing(userId, body);

    return c.json({ id: newProduce.id }, 201);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    operationId: 'updateProduce',
    description: 'Update a listing or pause it.',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              status: z.enum(['active', 'paused']),
              totalOzInventory: z.number(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Listing updated',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call update produce service.
  (c) => c.json({ success: true }, 200),
);

produceRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    operationId: 'deleteProduce',
    description: 'Remove a listing (soft delete).',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'Listing deleted',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  // TODO: [Service] Call delete produce service.
  (c) => c.json({ success: true }, 200),
);
