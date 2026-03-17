import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env' });

export default defineConfig({
  test: {
    pool: 'threads',
    globals: true,
    env: {
      AUTH_SECRET: 'super-secret-test-key-that-is-at-least-32-chars-long',
      AUTH_TRUST_HOST: 'true',
    },
  },
});
