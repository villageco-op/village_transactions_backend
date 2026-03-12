import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env' });

export default defineConfig({
  test: {
    pool: 'threads',
    globals: true,
  },
});
