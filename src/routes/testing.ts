import { Hono } from 'hono';

import type { RouteEnv } from '../app.js';
import {
  generateAuthJsCookieValue,
  getTestLatestInviteCode,
  seedTestOrganization,
  seedTestProduce,
  seedTestUser,
} from '../services/testing.service.js';
import { getLatestVerificationToken } from '../services/verification.service.js';
import { cookieName, isLocal, isTestingEnvironment } from '../utils.js';

export const testingRoute = new Hono<RouteEnv>();

if (isTestingEnvironment) {
  testingRoute.get('/', async (c) => {
    const { email } = c.req.query();
    const log = c.get('logger').child({ action: 'getLatestMagicToken', email });

    const tokenData = await getLatestVerificationToken(email, log);
    return c.json(tokenData, 200);
  });

  testingRoute.post('/seed-user', async (c) => {
    const log = c.get('logger').child({ action: 'seedTestUser' });
    const body = await c.req.json();

    const newUser = await seedTestUser(body, log);
    return c.json({ success: true, user: newUser }, 201);
  });

  testingRoute.post('/test-login', async (c) => {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: 'Missing target email address' }, 400);
    }

    const cookieValue = await generateAuthJsCookieValue(email);

    c.header(
      'Set-Cookie',
      `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${isLocal ? '' : '; Secure'}`,
    );

    return c.json({ success: true });
  });

  testingRoute.post('/seed-produce', async (c) => {
    const log = c.get('logger').child({ action: 'seedTestProduce' });

    const body = await c.req.json();

    if (!body.email) {
      return c.json({ error: 'Missing seller email address' }, 400);
    }

    const newProduce = await seedTestProduce(
      {
        email: body.email,
        produce: body.produce ?? {},
      },
      log,
    );

    return c.json({ success: true, produce: newProduce }, 201);
  });

  testingRoute.post('/seed-organization', async (c) => {
    const log = c.get('logger').child({ action: 'seedTestOrganization' });
    const body = await c.req.json();

    const newOrg = await seedTestOrganization(body, log);
    return c.json({ success: true, organization: newOrg }, 201);
  });

  testingRoute.get('/get-invite-code', async (c) => {
    const { email, orgId } = c.req.query();
    const log = c.get('logger').child({ action: 'getTestLatestInviteCode', email, orgId });

    if (!email || !orgId) {
      return c.json({ error: 'Missing required query parameters: email and orgId' }, 400);
    }

    const inviteData = await getTestLatestInviteCode(email, orgId, log);
    if (!inviteData) {
      return c.json({ error: 'No invite code found for the provided email and orgId' }, 404);
    }
    return c.json({ success: true, invite: inviteData }, 200);
  });
}
