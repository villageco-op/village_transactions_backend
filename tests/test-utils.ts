import { app } from '../src/app';

export const request = async (path: string, options: RequestInit = {}) => {
  const defaultHeaders = { 'Content-Type': 'application/json' };

  return await app.request(path, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  });
};
