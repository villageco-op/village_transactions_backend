import * as Sentry from '@sentry/node';

const dsn = process.env.BUGSINK_DSN;
const isProduction = process.env.NODE_ENV === 'production';

if (dsn && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    enabled: isProduction || Boolean(process.env.BUGSINK_ENABLED),
  });
}

export { Sentry };
