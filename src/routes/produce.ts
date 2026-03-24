import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

import {
  CreateProduceSchema,
  ProduceQuerySchema,
  UpdateProduceSchema,
  ProduceListItemSchema,
  ProduceMapQuerySchema,
  SellerMapGroupSchema,
  ProduceOrdersQuerySchema,
  ProduceOrderListItemSchema,
  ProduceSchema,
  SellerProduceQuerySchema,
} from '../schemas/produce.schema.js';
import {
  createProduceListing,
  deleteProduceListing,
  updateProduceListing,
  getProduceList,
  getProduceMap,
  getProduceOrders,
  getSellerProduceListings,
} from '../services/produce.service.js';

export const produceRoute = new OpenAPIHono();

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/map',
    operationId: 'getProduceMap',
    description: 'See sellers on a map.',
    request: {
      query: ProduceMapQuerySchema,
    },
    responses: {
      200: {
        description: 'Map items',
        content: { 'application/json': { schema: z.array(SellerMapGroupSchema) } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');

    const items = await getProduceMap({
      lat: query.lat,
      lng: query.lng,
      radiusMiles: query.radiusMiles,
      produceType: query.produceType,
      hasDelivery: query.hasDelivery,
      maxPrice: query.maxPrice,
    });

    return c.json(items, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/list',
    operationId: 'getProduceList',
    description: 'See list of produce/sellers.',
    request: {
      query: ProduceQuerySchema,
    },
    responses: {
      200: {
        description: 'List of produce',
        content: { 'application/json': { schema: z.array(ProduceListItemSchema) } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');

    const items = await getProduceList({
      lat: query.lat,
      lng: query.lng,
      sortBy: query.sortBy,
      hasDelivery: query.hasDelivery,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(items, 200);
  },
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
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: UpdateProduceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Listing updated',
        content: {
          'application/json': { schema: z.object({ success: z.boolean(), id: z.string() }) },
        },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'Not Found / Unauthorized Listing Ownership',
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

    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedProduce = await updateProduceListing(id, userId, body);

    if (!updatedProduce) {
      return c.json({ error: 'Listing not found or unauthorized' }, 404);
    }

    return c.json({ success: true, id: updatedProduce.id }, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    operationId: 'deleteProduce',
    description: 'Remove a listing (soft delete).',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Listing deleted',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'Not Found / Unauthorized',
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

    const { id } = c.req.valid('param');

    const success = await deleteProduceListing(id, userId);

    if (!success) {
      return c.json({ error: 'Listing not found or unauthorized' }, 404);
    }

    return c.json({ success: true }, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/orders',
    operationId: 'getProduceOrders',
    description: 'View paginated orders associated with one specific produce listing.',
    request: {
      params: z.object({ id: z.string().uuid() }),
      query: ProduceOrdersQuerySchema,
    },
    responses: {
      200: {
        description: 'List of orders for the produce listing',
        content: { 'application/json': { schema: z.array(ProduceOrderListItemSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: 'Not Found / Unauthorized Listing Ownership',
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

    const { id } = c.req.valid('param');
    const query = c.req.valid('query');

    const orders = await getProduceOrders(id, userId, query.limit, query.offset);

    if (!orders) {
      return c.json({ error: 'Listing not found or unauthorized' }, 404);
    }

    return c.json(orders, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getSellerListings',
    description: "Fetch the authenticated seller's own produce listings with full details.",
    request: {
      query: SellerProduceQuerySchema,
    },
    responses: {
      200: {
        description: "List of the seller's produce",
        content: { 'application/json': { schema: z.array(ProduceSchema) } },
      },
      401: {
        description: 'Unauthorized',
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

    const query = c.req.valid('query');

    const items = await getSellerProduceListings(userId, {
      limit: query.limit,
      offset: query.offset,
      status: query.status,
    });

    return c.json(items, 200);
  },
);
