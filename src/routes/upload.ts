import { verifyAuth } from '@hono/auth-js';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { put } from '@vercel/blob';

import type { RouteEnv } from '../app.js';
import { TAGS } from '../constants/tags.js';
import { ErrorResponseSchema } from '../schemas/common.schema.js';
import { UploadImageSchema, UploadResponseSchema } from '../schemas/upload.schema.js';

export const uploadRoute = new OpenAPIHono<RouteEnv>();

uploadRoute.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'uploadImage',
    description: 'Upload an image and get back the public URL to use in other API calls.',
    tags: [TAGS.UPLOAD],
    middleware: [verifyAuth()],
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: UploadImageSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Image successfully uploaded',
        content: { 'application/json': { schema: UploadResponseSchema } },
      },
      400: {
        description: 'Invalid file upload',
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

    const body = c.req.valid('form');
    const file = body.file as File;

    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'File must be an image' }, 400);
    }

    const filename = `${userId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const log = c.get('logger').child({
      filename,
      action: 'uploadImage',
    });

    log.info('Uploading image to images/');

    const { url } = await put(`images/${filename}`, file, {
      access: 'public',
    });

    log.info({ url }, 'Image upload completed');

    return c.json({ url }, 200);
  },
);
