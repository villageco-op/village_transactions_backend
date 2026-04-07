import { z } from '@hono/zod-openapi';

import { ImageUrlSchema } from './common.schema.js';

export const UploadImageSchema = z
  .object({
    file: z.instanceof(File).openapi({
      type: 'string',
      format: 'binary',
      description: 'The image file to upload (JPEG, PNG, WebP)',
    }),
  })
  .openapi('UploadImagePayload');

export const UploadResponseSchema = z
  .object({
    url: ImageUrlSchema,
  })
  .openapi('UploadResponse');
