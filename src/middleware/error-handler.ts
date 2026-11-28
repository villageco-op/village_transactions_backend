import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppBindings } from '../app.js';
import type { DatabaseError } from '../interfaces/error.interface.js';
import { Sentry } from '../lib/bugsink.js';
import { logger as rootLogger } from '../lib/logger.js';
import { isDatabaseError } from '../utils.js';

export const errorHandler: ErrorHandler<AppBindings> = async (err, c) => {
  const log = c.get('logger') || rootLogger;
  const reqId = log.bindings()?.reqId;

  if (err instanceof HTTPException) {
    log.warn({ err, status: err.status }, 'HTTP Exception caught');

    if (err.status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('path', c.req.path);
        scope.setTag('method', c.req.method);
        scope.setTag('status', String(err.status));
        if (reqId) {
          scope.setTag('requestId', String(reqId));
        }
        scope.setContext('request', {
          path: c.req.path,
          method: c.req.method,
        });
        Sentry.captureException(err);
      });
      await Sentry.flush(2000);
    }

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

  Sentry.withScope((scope) => {
    scope.setTag('path', c.req.path);
    scope.setTag('method', c.req.method);
    if (reqId) {
      scope.setTag('requestId', String(reqId));
    }
    if (isDatabaseError(dbError) && dbError.code) {
      scope.setTag('dbCode', String(dbError.code));
    }
    scope.setContext('request', {
      path: c.req.path,
      method: c.req.method,
    });
    Sentry.captureException(err);
  });

  await Sentry.flush(2000);

  return c.json({ error: 'Internal Server Error' }, 500);
};
