import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import { GetGrowersQuerySchema, GrowersResponseSchema } from '../schemas/buyer.schema.js';
import { getGrowersForBuyer } from '../services/buyer.service.js';

export const buyerRoute = new OpenAPIHono();

buyerRoute.openapi(
  createRoute({
    method: 'get',
    path: '/growers',
    operationId: 'getBuyerGrowers',
    description:
      'Get list of sellers that the user bought from in the past, aggregated with stats.',
    request: {
      query: GetGrowersQuerySchema,
    },
    responses: {
      200: {
        description: 'List of growers the buyer previously ordered from.',
        content: { 'application/json': { schema: GrowersResponseSchema } },
      },
      401: {
        description: 'Unauthorized - User not logged in',
        content: { 'application/json': { schema: z.object({ message: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const authUser = c.get('authUser');
    const userId = authUser?.session?.user?.id;

    if (!userId) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }

    const { limit, offset } = c.req.valid('query');

    const growers = await getGrowersForBuyer(userId, limit, offset);

    return c.json(growers, 200);
  },
);
