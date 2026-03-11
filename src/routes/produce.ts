import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

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
    description: 'Create a new listing.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string(),
              pricePerOz: z.number(),
              totalOzInventory: z.number(),
              harvestFrequencyDays: z.number(),
              seasonStart: z.string(),
              seasonEnd: z.string(),
              images: z.array(z.string()),
              isSubscribable: z.boolean(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Listing created',
        content: { 'application/json': { schema: z.object({ id: z.string() }) } },
      },
    },
  }),
  // TODO: [Service] Get data and call create produce service.
  (c) => c.json({ id: 'prod_123' }, 201),
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
