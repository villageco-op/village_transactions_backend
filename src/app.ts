import 'dotenv/config';
import { authHandler, initAuthConfig } from '@hono/auth-js';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { pinoLogger } from 'hono-pino';
import type { Logger } from 'pino';

import type { DatabaseError } from './interfaces/error.interface.js';
import { getAuthConfig } from './lib/auth-config.js';
import { logger as rootLogger } from './lib/logger.js';
import { openApiConfig } from './lib/openapi-config.js';
import { registerSharedSchemas } from './lib/register-schemas.js';
import { availabilityRoute } from './routes/availability.js';
import { buyerRoute } from './routes/buyer.js';
import { cartRoute } from './routes/cart.js';
import { checkoutRoute } from './routes/checkout.js';
import { contactRoute } from './routes/contact.js';
import { cronRoute } from './routes/cron.js';
import { growersRoute } from './routes/growers.js';
import { messagingRoute } from './routes/messaging.js';
import { ordersRoute } from './routes/orders.js';
import { produceRoute } from './routes/produce.js';
import { reviewsRoute } from './routes/reviews.js';
import { sellerRoute } from './routes/seller.js';
import { sourceMapRoute } from './routes/source-map.js';
import { stripeRoute } from './routes/stripe.js';
import { subscriptionsRoute } from './routes/subscriptions.js';
import { uploadRoute } from './routes/upload.js';
import { usersRoute } from './routes/users.js';
import { isDatabaseError } from './utils.js';

export type AppBindings = {
  Variables: {
    logger: Logger;
  };
};

export type RouteEnv = {
  Variables: {
    logger: Logger;
  };
};

export const app = new OpenAPIHono<AppBindings>();

app.onError((err, c) => {
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
});

const sanitizedFrontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
const allowedOrigins = [sanitizedFrontendUrl];

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return origin;
      }
      return undefined;
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/api/staging-unlock', (c) => {
  const expectedKey = process.env.STAGING_SECRET_KEY;
  if (!expectedKey) {
    return c.json({ error: 'Staging environment key is missing on backend.' }, 500);
  }

  const isPreview = process.env.VERCEL_ENV === 'preview';

  setCookie(c, 'village_staging_access', expectedKey, {
    path: '/',
    secure: true,
    httpOnly: true,
    domain: isPreview ? '.villageco-op.com' : undefined,
    sameSite: isPreview ? 'Lax' : undefined,
    maxAge: 60 * 60 * 24 * 30,
  });

  return c.json({ success: true, message: 'Staging access granted.' });
});

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    c.status(204);
    return c.body(null);
  }

  if (process.env.VERCEL_ENV === 'preview') {
    const stagingCookie = getCookie(c, 'village_staging_access');
    const expectedKey = process.env.STAGING_SECRET_KEY;

    if (!stagingCookie || stagingCookie !== expectedKey) {
      c.status(401);
      return c.json({ error: 'Staging environment locked. Missing valid preview session.' });
    }
  }

  await next();
});

app.use(
  '*',
  pinoLogger({
    pino: rootLogger,
    http: {
      reqId: () => crypto.randomUUID(),
    },
  }),
);

app.use('*', initAuthConfig(getAuthConfig));
app.use('/api/auth/*', authHandler());

app.use('*', async (c, next) => {
  const authUser = c.get('authUser');
  const userId = authUser?.session?.user?.id;

  const requestLogger = rootLogger.child({
    userId: userId || 'anonymous',
    traceId: crypto.randomUUID(),
  });

  c.set('logger', requestLogger);

  await next();
});

registerSharedSchemas(app);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/users', usersRoute);
app.route('/api/produce', produceRoute);
app.route('/api/upload', uploadRoute);
app.route('/api/cart', cartRoute);
app.route('/api/checkout', checkoutRoute);
app.route('/api/stripe', stripeRoute);
app.route('/api/orders', ordersRoute);
app.route('/api/subscriptions', subscriptionsRoute);
app.route('/api/availability', availabilityRoute);
app.route('/api/conversations', messagingRoute.conversationsRoute);
app.route('/api/messages', messagingRoute.messagesRoute);
app.route('/api/seller', sellerRoute);
app.route('/api/buyer', buyerRoute);
app.route('/api/reviews', reviewsRoute);
app.route('/api/growers', growersRoute);
app.route('/api/source-map', sourceMapRoute);
app.route('/api/cron', cronRoute);
app.route('/api/contact', contactRoute);

app.doc('/doc', openApiConfig);

app.get('/ui', swaggerUI({ url: '/doc' }));

export default app;
