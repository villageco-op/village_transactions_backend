import { app } from '../../src/app';

/**
 * Executes a local request against the Hono application instance.
 * @param path - The target URL path
 * @param options - Request configuration including method and body
 * @returns The resulting Response object
 */
export const request = async (path: string, options: RequestInit = {}) => {
  const defaultHeaders = { 'Content-Type': 'application/json' };

  return await app.request(path, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  });
};
