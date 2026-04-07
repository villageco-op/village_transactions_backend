import { app } from '../../src/app';

/**
 * Executes a local request against the Hono application instance.
 * @param path - The target URL path
 * @param options - Request configuration including method and body
 * @returns The resulting Response object
 */
export const request = async (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return await app.request(path, {
    ...options,
    headers,
  });
};
