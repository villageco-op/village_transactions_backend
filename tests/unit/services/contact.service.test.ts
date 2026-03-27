import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { processContactForm } from '../../../src/services/contact.service.js';

describe('ContactService - processContactForm', () => {
  let mockResend: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
      },
    };

    process.env.VILLAGE_CONTACT_EMAIL = 'admin@village.com';
    process.env.VILLAGE_FROM_EMAIL = 'noreply@village.com';
  });

  it('should successfully send forward and auto-reply emails', async () => {
    mockResend.emails.send.mockResolvedValue({ data: { id: 'test_id' }, error: null });

    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Acme Corp',
      message: 'Hello, this is a test message.',
    };

    await processContactForm(mockResend, payload);

    expect(mockResend.emails.send).toHaveBeenCalledTimes(2);

    expect(mockResend.emails.send).toHaveBeenNthCalledWith(1, {
      from: 'Village Website <noreply@village.com>',
      to: 'admin@village.com',
      replyTo: 'john@example.com',
      subject: 'New Contact Form Submission from John Doe',
      text: expect.stringContaining('Name: John Doe'),
    });

    expect(mockResend.emails.send).toHaveBeenNthCalledWith(2, {
      from: 'Village Team <noreply@village.com>',
      to: 'john@example.com',
      subject: 'We received your message!',
      text: expect.stringContaining('Hi John Doe'),
    });
  });

  it('should throw an HTTPException if forwarding the message fails', async () => {
    mockResend.emails.send.mockResolvedValue({ data: null, error: { message: 'API Error' } });

    const payload = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Test message',
    };

    await expect(processContactForm(mockResend, payload)).rejects.toThrow(HTTPException);
    await expect(processContactForm(mockResend, payload)).rejects.toMatchObject({ status: 500 });
  });

  it('should NOT throw if auto-reply fails but forwarding succeeds', async () => {
    mockResend.emails.send
      .mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Reply Error' } });

    const payload = {
      name: 'Bob',
      email: 'bob@example.com',
      message: 'Test message',
    };

    await expect(processContactForm(mockResend, payload)).resolves.toBeUndefined();
  });
});
