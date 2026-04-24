import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import {
  SourceMapAnalyticsResponseSchema,
  SourceMapNodesResponseSchema,
  SourceMapQuerySchema,
} from '../schemas/source-map.schema.js';
import { getSourceMapAnalytics, getSourceMapNodes } from '../services/source-map.service.js';

export const sourceMapRoute = new OpenAPIHono();

sourceMapRoute.openapi(
  createRoute({
    method: 'get',
    path: '/nodes',
    operationId: 'getSourceMapNodes',
    description: 'Fetch map nodes representing local suppliers, scaled by volume and spend.',
    tags: [TAGS.SOURCE_MAP],
    middleware: [verifyAuth()],
    request: { query: SourceMapQuerySchema },
    responses: {
      200: {
        description: 'Array of supply map nodes.',
        content: { 'application/json': { schema: SourceMapNodesResponseSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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

    const { produceType, season } = c.req.valid('query');
    const nodes = await getSourceMapNodes({
      buyerId: userId,
      produceType: produceType,
      season,
    });
    return c.json(nodes, 200);
  },
);

sourceMapRoute.openapi(
  createRoute({
    method: 'get',
    path: '/analytics',
    operationId: 'getSourceMapAnalytics',
    description: 'Fetch overarching impact statistics for the source map sidebar.',
    tags: [TAGS.SOURCE_MAP],
    middleware: [verifyAuth()],
    request: { query: SourceMapQuerySchema },
    responses: {
      200: {
        description: 'Aggregated analytics object.',
        content: { 'application/json': { schema: SourceMapAnalyticsResponseSchema } },
      },
      400: {
        description: 'Bad Request',
        content: { 'application/json': { schema: ErrorResponseSchema } },
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

    const { produceType, season } = c.req.valid('query');
    const analytics = await getSourceMapAnalytics({
      buyerId: userId,
      produceType: produceType,
      season,
    });
    return c.json(analytics, 200);
  },
);
