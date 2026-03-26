import { describe, it, expect, vi, beforeEach } from 'vitest';

import { request } from '../../test-utils/request.js';

vi.mock('../../../src/lib/resend.js', () => {
  return {
    resend: {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'mocked_msg_id' }, error: null }),
      },
    },
  };
});

import { resend as mockResend } from '../../../src/lib/resend.js';

describe('Contact API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.VILLAGE_CONTACT_EMAIL = 'admin@example.com';
    process.env.VILLAGE_FROM_EMAIL = 'noreply@example.com';
  });

  it('POST /api/contact should process the form and return 200 { success: true }', async () => {
    const res = await request('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration User',
        email: 'integration@example.com',
        company: 'Test Company',
        message: 'Integration test message',
      }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ success: true });

    expect(mockResend.emails.send).toHaveBeenCalledTimes(2);
  });

  it('POST /api/contact should return validation error (400) if required fields are missing', async () => {
    const res = await request('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Missing Email User',
      }),
    });

    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('POST /api/contact should return validation error (400) if email format is invalid', async () => {
    const res = await request('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Email User',
        email: 'not-an-email',
        message: 'Valid message content',
      }),
    });

    expect(res.status).toBe(400);
  });
});
