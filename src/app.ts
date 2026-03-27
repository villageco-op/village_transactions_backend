import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';

import type { DatabaseError } from './interfaces/error.interface.js';
import { getAuthConfig } from './lib/auth-config.js';
import { openApiConfig } from './lib/openapi-config.js';
import { availabilityRoute } from './routes/availability.js';
import { cartRoute } from './routes/cart.js';
import { checkoutRoute } from './routes/checkout.js';
import { cronRoute } from './routes/cron.js';
import { messagingRoute } from './routes/messaging.js';
import { ordersRoute } from './routes/orders.js';
import { produceRoute } from './routes/produce.js';
import { sellerRoute } from './routes/seller.js';
import { stripeRoute } from './routes/stripe.js';
import { subscriptionsRoute } from './routes/subscriptions.js';
import { usersRoute } from './routes/users.js';
import { isDatabaseError } from './utils.js';

export const app = new OpenAPIHono();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  let dbError: DatabaseError | Error = err;

  if (err.cause && isDatabaseError(err.cause)) {
    dbError = err.cause;
  }

  if (isDatabaseError(dbError)) {
    switch (dbError.code) {
      case '23503': // Foreign Key Violation
        return c.json(
          {
            error: 'Related resource not found',
            detail: dbError.detail,
          },
          400,
        );

      case '23505': // Unique Violation
        return c.json(
          {
            error: 'Resource already exists',
            detail: dbError.detail,
          },
          409,
        );
    }
  }
  // TODO: log the error
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.use('*', initAuthConfig(getAuthConfig));

app.use('/api/auth/*', authHandler());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('/api/users/*', verifyAuth());
app.use('/api/produce/*', verifyAuth());
app.use('/api/cart/*', verifyAuth());
app.use('/api/stripe/connect/onboard', verifyAuth());

app.route('/api/users', usersRoute);
app.route('/api/produce', produceRoute);
app.route('/api/cart', cartRoute);
app.route('/api/checkout', checkoutRoute);
app.route('/api/stripe', stripeRoute);
app.route('/api/orders', ordersRoute);
app.route('/api/subscriptions', subscriptionsRoute);
app.route('/api/availability', availabilityRoute);
app.route('/api/conversations', messagingRoute.conversationsRoute);
app.route('/api/messages', messagingRoute.messagesRoute);
app.route('/api/seller', sellerRoute);
app.route('/api/cron', cronRoute);

app.doc('/doc', openApiConfig);

app.get('/ui', swaggerUI({ url: '/doc' }));

export default app;
