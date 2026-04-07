import { describe, it, expect } from 'vitest';
import { authedRequest } from '../../test-utils/auth.js';

describe('Upload API - Smoke Tests', () => {
  it('POST /api/upload should not return a 500 error', async () => {
    const formData = new FormData();
    const file = new File(['dummy video content'], 'test.mp4', { type: 'video/mp4' });
    formData.append('file', file);

    const res = await authedRequest('/api/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).not.toBe(500);
  });
});
