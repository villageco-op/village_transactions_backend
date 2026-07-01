import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EmailService } from '../../../src/services/email.service.js';

const { mockSend } = vi.hoisted(() => {
  return { mockSend: vi.fn() };
});

vi.mock('resend', () => {
  return {
    Resend: class {
      get emails() {
        return { send: mockSend };
      }
    },
  };
});

describe('EmailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 'test_key';
    process.env.VILLAGE_FROM_EMAIL = 'noreply@village.com';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return failure if RESEND_API_KEY is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const serviceWithoutKey = new EmailService();

    const result = await serviceWithoutKey.send({
      to: 'test@user.com',
      subject: 'Test Subject',
      text: 'Test content',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Email service not initialized');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should call Resend SDK with correct parameters and default name', async () => {
    mockSend.mockResolvedValue({ data: { id: '123' }, error: null });
    const emailService = new EmailService();

    const result = await emailService.send({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Body text',
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Village Team <noreply@village.com>',
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Body text',
      replyTo: undefined,
    });
  });

  it('should override the fromName if specified', async () => {
    mockSend.mockResolvedValue({ data: { id: '123' }, error: null });
    const emailService = new EmailService();

    await emailService.send({
      fromName: 'Custom App',
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Body text',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Custom App <noreply@village.com>',
      }),
    );
  });

  it('should catch SDK return errors and wrap them in a structural failure', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Resend infrastructure error' } });
    const emailService = new EmailService();

    const result = await emailService.send({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Body text',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Resend infrastructure error');
  });

  it('should gracefully catch unexpected runtime crashes in the SDK wrapper', async () => {
    mockSend.mockRejectedValue(new Error('Network Crash'));
    const emailService = new EmailService();

    const result = await emailService.send({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'Body text',
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Network Crash');
  });
});
