import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { processContactForm } from '../../../src/services/contact.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { registerFcmToken } from '../../../src/services/notification.service.js';
import { fcmRepository } from '../../../src/repositories/fcm.repository.js';

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/fcm.repository.js', () => ({
  fcmRepository: {
    upsertToken: vi.fn(),
    getTokensByUserId: vi.fn(),
    deleteTokens: vi.fn(),
  },
}));

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

describe('registerFcmToken', () => {
  it('should throw a 404 HTTPException if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(registerFcmToken('missing_user_id', 'token123', 'ios')).rejects.toThrow(
      HTTPException,
    );
    await expect(registerFcmToken('missing_user_id', 'token123', 'ios')).rejects.toMatchObject({
      status: 404,
    });

    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
  });

  it('should update the FCM token and platform when the user is found', async () => {
    const mockDbUser = {
      id: 'user_123',
      email: 'alice@example.com',
    };

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockDbUser as any);
    vi.mocked(fcmRepository.upsertToken).mockResolvedValueOnce();

    await registerFcmToken('user_123', 'test_fcm_token_999', 'android');

    expect(userRepository.findById).toHaveBeenCalledWith('user_123');
    expect(fcmRepository.upsertToken).toHaveBeenCalledWith(
      'user_123',
      'test_fcm_token_999',
      'android',
    );
  });
});
