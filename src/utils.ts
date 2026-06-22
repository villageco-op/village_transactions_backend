import type { DatabaseError } from './interfaces/error.interface.js';

/**
 * Checks if an error is a database error.
 * @param err An unkown error.
 * @returns True if the error has a code or cause field.
 */
export function isDatabaseError(err: unknown): err is DatabaseError {
  return err instanceof Error && ('code' in err || 'cause' in err);
}

/**
 * Utility type for deep mocking.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/**
 * Utility to calculate standard Haversine distance in miles.
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns The distance between the coordinates
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Is this a testing environment.
 */
export const isTestingEnvironment =
  process.env.NODE_ENV === 'test' || process.env.VERCEL_ENV === 'preview';

/**
 * Is this a local machine
 */
export const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL_ENV;

/**
 * Dynamic cookie name for test route authentication.
 */
export const cookieName = isLocal ? 'authjs.session-token' : '__Secure-authjs.session-token';

/**
 * Normalizes a string into a URL-friendly slug.
 * @param text - String to be normalized
 * @returns The URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
