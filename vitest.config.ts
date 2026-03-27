import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env' });

export default defineConfig({
  test: {
    globals: true,
    env: {
      AUTH_SECRET: 'super-secret-test-key-that-is-at-least-32-chars-long',
      AUTH_TRUST_HOST: 'true',
    },

    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          pool: 'threads',
          setupFiles: ['dotenv/config'],
        },
      },
      {
        test: {
          name: 'smoke',
          include: ['tests/smoke/**/*.test.ts'],
          pool: 'threads',
          setupFiles: ['dotenv/config'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          pool: 'forks',
          fileParallelism: false,
          globalSetup: './tests/integration/global-setup.ts',
          setupFiles: ['dotenv/config'],
        },
      },
    ],
  },
});
