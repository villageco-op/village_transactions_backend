import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
  SuccessWithEntitySchema,
} from '../schemas/common.schema.js';
import {
  CreateProduceSchema,
  ProduceQuerySchema,
  UpdateProduceSchema,
  ProduceMapQuerySchema,
  ProduceOrdersQuerySchema,
  SellerProduceQuerySchema,
  SellerMapGroupListSchema,
  ProduceListResponseSchema,
  ProduceOrderListResponseSchema,
  SellerProduceListResponseSchema,
  ProduceDetailSchema,
} from '../schemas/produce.schema.js';
import { getPaginationParams } from '../schemas/util/pagination.js';
import {
  createProduceListing,
  deleteProduceListing,
  updateProduceListing,
  getProduceList,
  getProduceMap,
  getProduceOrders,
  getSellerProduceListings,
  getProduceListing,
} from '../services/produce.service.js';

export const produceRoute = new OpenAPIHono();

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/map',
    operationId: 'getProduceMap',
    description: 'See sellers on a map.',
    tags: [TAGS.PRODUCE],
    request: {
      query: ProduceMapQuerySchema,
    },
    responses: {
      200: {
        description: 'Map items',
        content: { 'application/json': { schema: SellerMapGroupListSchema } },
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
      search: query.search,
      maxOrderQuantity: query.maxOrderQuantity,
      isSubscribable: query.isSubscribable,
      availableInventory: query.availableInventory,
      season: query.season,
      availableBy: query.availableBy,
      hasDelivery: query.hasDelivery,
      minPrice: query.minPrice,
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
    tags: [TAGS.PRODUCE],
    request: {
      query: ProduceQuerySchema,
    },
    responses: {
      200: {
        description: 'List of produce',
        content: { 'application/json': { schema: ProduceListResponseSchema } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');
    const { limit, offset } = getPaginationParams(query.page, query.limit);

    const paginatedItems = await getProduceList({
      lat: query.lat,
      lng: query.lng,
      sellerId: query.sellerId,
      sortBy: query.sortBy,
      hasDelivery: query.hasDelivery,
      produceType: query.produceType,
      search: query.search,
      maxOrderQuantity: query.maxOrderQuantity,
      isSubscribable: query.isSubscribable,
      availableInventory: query.availableInventory,
      season: query.season,
      availableBy: query.availableBy,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      maxDistance: query.maxDistance,
      page: query.page,
      limit: limit,
      offset: offset,
    });

    return c.json(paginatedItems, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createProduce',
    description: 'Create a new produce listing.',
    tags: [TAGS.PRODUCE],
    middleware: [verifyAuth()],
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
        content: { 'application/json': { schema: SuccessWithEntitySchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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

    return c.json({ success: true, entityId: newProduce.id }, 201);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'put',
    path: '/{id}',
    operationId: 'updateProduce',
    description: 'Update a listing or pause it.',
    tags: [TAGS.PRODUCE],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
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
          'application/json': { schema: SuccessWithEntitySchema },
        },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not Found / Unauthorized Listing Ownership',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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

    return c.json({ success: true, entityId: updatedProduce.id }, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    operationId: 'deleteProduce',
    description: 'Remove a listing (soft delete).',
    tags: [TAGS.PRODUCE],
    middleware: [verifyAuth()],
    request: { params: EntityParamSchema },
    responses: {
      200: {
        description: 'Listing deleted',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not Found / Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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
    tags: [TAGS.PRODUCE],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      query: ProduceOrdersQuerySchema,
    },
    responses: {
      200: {
        description: 'List of orders for the produce listing',
        content: { 'application/json': { schema: ProduceOrderListResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not Found / Unauthorized Listing Ownership',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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
    const { page, limit } = c.req.valid('query');

    const { offset } = getPaginationParams(page, limit);

    const paginatedOrders = await getProduceOrders(id, userId, page, limit, offset);

    if (!paginatedOrders) {
      return c.json({ error: 'Listing not found or unauthorized' }, 404);
    }

    return c.json(paginatedOrders, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    operationId: 'getSellerListings',
    description: "Fetch the authenticated seller's own produce listings with full details.",
    tags: [TAGS.PRODUCE],
    middleware: [verifyAuth()],
    request: {
      query: SellerProduceQuerySchema,
    },
    responses: {
      200: {
        description: "List of the seller's produce including metrics",
        content: { 'application/json': { schema: SellerProduceListResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { status, page, limit } = c.req.valid('query');

    const { offset } = getPaginationParams(page, limit);

    const paginatedItems = await getSellerProduceListings(userId, {
      page: page,
      limit: limit,
      offset: offset,
      status: status,
    });

    return c.json(paginatedItems, 200);
  },
);

produceRoute.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    operationId: 'getProduce',
    description:
      'Get details of a specific produce listing. Used by buyers to view items and sellers to populate edit forms.',
    tags: [TAGS.PRODUCE],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Produce listing details',
        content: { 'application/json': { schema: ProduceDetailSchema } },
      },
      404: {
        description: 'Listing Not Found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');

    const item = await getProduceListing(id);

    if (!item) {
      return c.json({ error: 'Listing not found' }, 404);
    }

    return c.json(item, 200);
  },
);
