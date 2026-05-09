import { serve } from '@hono/node-server';

import { app } from './app.js';
import { logger } from './lib/logger.js';

serve({
  fetch: app.fetch,
  port: 3000,
});
logger.info('Server running on http://localhost:3000');
