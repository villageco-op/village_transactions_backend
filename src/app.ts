import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';

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

export const app = new OpenAPIHono();

app.use('*', initAuthConfig(getAuthConfig));

app.use('/api/auth/*', authHandler());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('/api/users/*', verifyAuth());

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
