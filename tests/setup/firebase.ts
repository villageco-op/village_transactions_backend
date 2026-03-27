import { vi } from 'vitest';

vi.mock('../../src/lib/firebase.js', () => ({
  messaging: {
    sendEachForMulticast: vi.fn().mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    }),
  },
}));
