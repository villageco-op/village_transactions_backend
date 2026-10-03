import 'dotenv/config';
import { authHandler, initAuthConfig } from '@hono/auth-js';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { pinoLogger } from 'hono-pino';
import type { Logger } from 'pino';

import { getAuthConfig } from './lib/auth-config.js';
import { logger as rootLogger } from './lib/logger.js';
import { openApiConfig } from './lib/openapi-config.js';
import { registerSharedSchemas } from './lib/register-schemas.js';
import {
  contextLoggerMiddleware,
  corsMiddleware,
  e2eDbMiddleware,
  errorHandler,
  rateLimitMiddleware,
  stagingGuardMiddleware,
} from './middleware/index.js';
import { availabilityRoute } from './routes/availability.js';
import { buyerRoute } from './routes/buyer.js';
import { cartRoute } from './routes/cart.js';
import { checkoutRoute } from './routes/checkout.js';
import { clientsRoute } from './routes/clients.js';
import { contactRoute } from './routes/contact.js';
import { cronRoute } from './routes/cron.js';
import { growersRoute } from './routes/growers.js';
import { invitesRoute } from './routes/invite.js';
import { locationRoute } from './routes/location.js';
import { messagingRoute } from './routes/messaging.js';
import { ordersRoute } from './routes/orders.js';
import { organizationsRoute } from './routes/organizations.js';
import { produceRoute } from './routes/produce.js';
import { reviewsRoute } from './routes/reviews.js';
import { sellerRoute } from './routes/seller.js';
import { stripeRoute } from './routes/stripe.js';
import { subscriptionsRoute } from './routes/subscriptions.js';
import { testingRoute } from './routes/testing.js';
import { uploadRoute } from './routes/upload.js';
import { usersRoute } from './routes/users.js';

export type AppBindings = {
  Variables: {
    logger: Logger;
  };
};

export type RouteEnv = AppBindings;

export const app = new OpenAPIHono<AppBindings>();

app.use('/api/*', rateLimitMiddleware);
app.onError(errorHandler);
app.use('*', corsMiddleware);

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

app.use('*', e2eDbMiddleware);
app.use('*', stagingGuardMiddleware);

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

app.use('*', contextLoggerMiddleware);

app.use(
  '/api/*',
  bodyLimit({
    maxSize: 2 * 1024 * 1024, // 2MB limit
    onError: (c) => c.json({ error: 'Payload too large' }, 413),
  }),
);

app.use('*', secureHeaders());

registerSharedSchemas(app);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/users', usersRoute);
app.route('/api/organizations', organizationsRoute);
app.route('/api/invites', invitesRoute);
app.route('/api/clients', clientsRoute);
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
app.route('/api/cron', cronRoute);
app.route('/api/contact', contactRoute);
app.route('/api/location', locationRoute);
app.route('/api/testing', testingRoute);

app.doc('/api/doc', openApiConfig);

app.get('/api/ui', swaggerUI({ url: '/doc' }));

export default app;
