import type { DatabaseError } from './interfaces/error.interface.js';

/**
 * Checks if an error is a database error.
 * @param err An unkown error.
 * @returns True if the error has a code or cause field.
 */
export function isDatabaseError(err: unknown): err is DatabaseError {
  return err instanceof Error && ('code' in err || 'cause' in err);
}
