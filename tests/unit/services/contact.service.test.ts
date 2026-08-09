import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { processContactForm } from '../../../src/services/contact.service.js';
import { emailService } from '../../../src/services/email.service.js';

vi.mock('../../../src/services/email.service.js', () => ({
  emailService: {
    send: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../../src/repositories/fcm.repository.js', () => ({
  fcmRepository: {
    upsertToken: vi.fn(),
    getTokensByUserId: vi.fn(),
    deleteTokens: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/organization.repository.js', () => ({
  organizationRepository: {
    findById: vi.fn(),
  },
}));

describe('ContactService - processContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VILLAGE_CONTACT_EMAIL = 'admin@village.com';
  });

  it('should successfully send forward and auto-reply emails', async () => {
    vi.mocked(emailService.send).mockResolvedValue({ success: true });

    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Acme Corp',
      message: 'Hello, this is a test message.',
    };

    await processContactForm(payload);

    expect(emailService.send).toHaveBeenCalledTimes(2);

    expect(emailService.send).toHaveBeenNthCalledWith(
      1,
      {
        fromName: 'Village Website',
        to: 'admin@village.com',
        replyTo: 'john@example.com',
        subject: 'New Contact Form Submission from John Doe',
        text: expect.stringContaining('Name: John Doe'),
      },
      expect.anything(),
    );

    expect(emailService.send).toHaveBeenNthCalledWith(
      2,
      {
        to: 'john@example.com',
        subject: 'We received your message!',
        text: expect.stringContaining('Hi John Doe'),
        html: expect.any(String),
      },
      expect.anything(),
    );
  });

  it('should throw an HTTPException if forwarding the message fails', async () => {
    vi.mocked(emailService.send).mockResolvedValue({
      success: false,
      error: new Error('Forward failed'),
    });

    const payload = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Test message',
    };

    await expect(processContactForm(payload)).rejects.toThrow(HTTPException);
  });

  it('should NOT throw if auto-reply fails but forwarding succeeds', async () => {
    vi.mocked(emailService.send)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: new Error('Reply failed') });

    const payload = {
      name: 'Bob',
      email: 'bob@example.com',
      message: 'Test message',
    };

    await expect(processContactForm(payload)).resolves.toBeUndefined();
  });
});
