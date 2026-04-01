import { z } from '@hono/zod-openapi';

import { PaginationMetadataSchema } from '../common.schema.js';

/**
 * Creates a standardized OpenAPI-compliant Zod schema for paginated responses.
 * @param itemSchema - The Zod schema representing an individual item in the data array.
 * @param schemaName - The unique name used to register this schema in the OpenAPI documentation.
 * @returns A Zod object schema containing a `data` array and a `meta` pagination object.
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
  schemaName: string,
) {
  return z
    .object({
      data: z.array(itemSchema),
      meta: PaginationMetadataSchema,
    })
    .openapi(schemaName);
}

/**
 * Calculates SQL-style pagination parameters (limit and offset) from page-based input.
 * @remarks
 * This function assumes 1-based indexing for the `page` parameter.
 * For example, page 1 with a limit of 10 results in an offset of 0.
 * @param page - The current page number (1-indexed).
 * @param limit - The maximum number of items to return per page.
 * @returns An object containing the calculated `limit` and `offset`.
 */
export function getPaginationParams(page: number, limit: number) {
  return {
    limit,
    offset: (page - 1) * limit,
  };
}
