import { vi } from 'vitest';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({
        messageId: 'test-message-id',
        envelope: {},
        accepted: [],
        rejected: [],
        pending: [],
        response: '250 OK',
      }),
      verify: vi.fn().mockResolvedValue(true),
    }),
  },
}));
