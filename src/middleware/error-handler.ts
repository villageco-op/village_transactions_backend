import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppBindings } from '../app.js';
import type { DatabaseError } from '../interfaces/error.interface.js';
import { logger as rootLogger } from '../lib/logger.js';
import { isDatabaseError } from '../utils.js';

export const errorHandler: ErrorHandler<AppBindings> = (err, c) => {
  const log = c.get('logger') || rootLogger;

  if (err instanceof HTTPException) {
    log.warn({ err, status: err.status }, 'HTTP Exception caught');
    return c.json({ error: err.message }, err.status);
  }

  let dbError: DatabaseError | Error = err;

  if (err.cause && isDatabaseError(err.cause)) {
    dbError = err.cause;
  }

  if (isDatabaseError(dbError)) {
    switch (dbError.code) {
      case '23503': // Foreign Key Violation
        log.warn({ dbError, code: '23503' }, 'Foreign Key Violation');
        return c.json({ error: 'Related resource not found', detail: dbError.detail }, 400);

      case '23505': // Unique Violation
        log.warn({ dbError, code: '23505' }, 'Unique Constraint Violation');
        return c.json({ error: 'Resource already exists', detail: dbError.detail }, 409);
    }
  }

  log.error({ err, path: c.req.path }, 'Internal Server Error');
  return c.json({ error: 'Internal Server Error' }, 500);
};
