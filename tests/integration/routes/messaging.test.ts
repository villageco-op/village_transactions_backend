import { describe, it, expect } from 'vitest';
import { request } from '../../test-utils/request.js';

describe('Messaging API', () => {
  it('GET /api/conversations should return 200', async () => {
    const res = await request('/api/conversations');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/messages should return 200', async () => {
    const res = await request('/api/messages?conversationId=conv_123&since=2023-10-27T10:00:00Z');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /api/messages should return 200', async () => {
    const res = await request('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: 'conv_123',
        text: 'Hello, is this still available?',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
