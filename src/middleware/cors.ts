import { cors } from 'hono/cors';

const sanitizedFrontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
const allowedOrigins = [sanitizedFrontendUrl];

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'x-e2e-neon-db-url'],
});
