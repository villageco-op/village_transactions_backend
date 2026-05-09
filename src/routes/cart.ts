import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { NotFoundError } from '../lib/errors.js';
import {
  AddToCartSchema,
  GetCartResponseSchema,
  UpdateCartGroupSchema,
  UpdateCartSchema,
} from '../schemas/cart.schema.js';
import {
  EntityParamSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
  SuccessWithEntitySchema,
} from '../schemas/common.schema.js';
import {
  addToCart,
  getCart,
  removeFromCart,
  updateCartGroup,
  updateCartItem,
} from '../services/cart.service.js';

export const cartRoute = new OpenAPIHono<RouteEnv>();

cartRoute.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'getCart',
    description:
      "Fetch user's active cart. Groups items into checkouts partitioned by Seller AND Subscription vs Single-Purchase configurations. Drops expired reservations automatically.",
    tags: [TAGS.CART],
    middleware: [verifyAuth()],
    responses: {
      200: {
        description: 'Cart Checkouts Object',
        content: { 'application/json': { schema: GetCartResponseSchema } },
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

    const log = c.get('logger').child({ action: 'getCart' });

    const cart = await getCart(userId, log);
    return c.json({ data: cart }, 200);
  },
);

cartRoute.openapi(
  createRoute({
    method: 'post',
    path: '/add',
    operationId: 'addToCart',
    description: 'Add item to cart and create a soft reservation.',
    tags: [TAGS.CART],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'application/json': {
            schema: AddToCartSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Added to cart',
        content: {
          'application/json': {
            schema: SuccessWithEntitySchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Product not found',
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

    const log = c.get('logger').child({
      productId: body.productId,
      action: 'addToCart',
    });

    try {
      const reservation = await addToCart(userId, body);
      log.info({ reservationId: reservation.id }, 'Created product reservation');
      return c.json({ success: true, entityId: reservation.id }, 200);
    } catch (error) {
      if (error instanceof NotFoundError) {
        log.warn({ productId: body.productId }, 'Attempted to add non-existent product');
        return c.json({ error: error.message }, 404);
      }

      throw error;
    }
  },
);

cartRoute.openapi(
  createRoute({
    method: 'delete',
    path: '/remove/{id}',
    operationId: 'removeFromCart',
    description: 'Explicitly remove an item and release the reservation early.',
    tags: [TAGS.CART],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
    },
    responses: {
      200: {
        description: 'Removed',
        content: { 'application/json': { schema: SuccessResponseSchema } },
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

    const { id: reservationId } = c.req.valid('param');

    const log = c.get('logger').child({
      reservationId,
      action: 'removeFromCart',
    });

    const success = await removeFromCart(userId, reservationId);

    if (success) {
      log.info('Manual reservation release successful');
    } else {
      log.warn('Failed to remove item; reservation may not exist or belong to user');
    }

    return c.json({ success }, 200);
  },
);

cartRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/update/{id}',
    operationId: 'updateCartItem',
    description: 'Update cart reservation quantity and subscription status.',
    tags: [TAGS.CART],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateCartSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated successfully',
        content: { 'application/json': { schema: SuccessResponseSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Reservation not found or expired',
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

    const { id: reservationId } = c.req.valid('param');
    const body = c.req.valid('json');

    const log = c.get('logger').child({
      reservationId,
      action: 'updateCartItem',
    });

    const success = await updateCartItem(userId, reservationId, body);

    if (!success) {
      log.warn('Update failed: reservation expired or ownership mismatch');
      return c.json({ error: 'Reservation not found or expired' }, 404);
    }

    log.info({ updates: Object.keys(body) }, 'Updated cart item quantity/status');
    return c.json({ success: true }, 200);
  },
);

cartRoute.openapi(
  createRoute({
    method: 'patch',
    path: '/group/{id}',
    operationId: 'updateCartGroup',
    description: 'Update settings (like fulfillmentType) for an entire checkout group.',
    tags: [TAGS.CART],
    middleware: [verifyAuth()],
    request: {
      params: EntityParamSchema,
      body: {
        content: { 'application/json': { schema: UpdateCartGroupSchema } },
      },
    },
    responses: {
      200: {
        description: 'Group updated successfully',
        content: { 'application/json': { schema: SuccessResponseSchema } },
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

    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const { id: groupId } = c.req.valid('param');
    const payload = c.req.valid('json');

    const log = c.get('logger').child({
      groupId,
      action: 'updateCartGroup',
    });

    await updateCartGroup(userId, groupId, payload);

    log.info({ fulfillmentType: payload.fulfillmentType }, 'Updated checkout group fulfillment');
    return c.json({ success: true }, 200);
  },
);
