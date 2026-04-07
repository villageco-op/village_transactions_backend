import { put } from '@vercel/blob';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

import { authedRequest } from '../../test-utils/auth.js';
import { request } from '../../test-utils/request.js';
import {
  truncateTables,
  getTestDb,
  closeTestDbConnection,
} from '../../test-utils/testcontainer-db.js';
import { userRepository } from '../../../src/repositories/user.repository.js';
import { users } from '../../../src/db/schema.js';

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

describe('Upload API Integration', { timeout: 60_000 }, () => {
  let testDb: any;
  const TEST_USER_ID = 'test_upload_user_123';

  beforeAll(() => {
    testDb = getTestDb();
    userRepository.setDb(testDb);
  });

  afterAll(async () => {
    await closeTestDbConnection();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateTables(testDb);
    vi.clearAllMocks();
  });

  it('POST /api/upload should return 200 and the image URL when a valid image is provided', async () => {
    await testDb.insert(users).values({
      id: TEST_USER_ID,
      email: 'uploader@example.com',
      name: 'Uploader',
    });

    const fakeBlobUrl = 'https://fake-blob.vercel-storage.com/images/test.png';
    vi.mocked(put).mockResolvedValueOnce({ url: fakeBlobUrl } as any);

    const formData = new FormData();
    const file = new File(['dummy image content'], 'profile.jpg', { type: 'image/jpeg' });
    formData.append('file', file);

    const res = await authedRequest(
      '/api/upload',
      {
        method: 'POST',
        body: formData,
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({ url: fakeBlobUrl });

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/test_upload_user_123-\d+-profile.jpg$/),
      expect.any(File),
      { access: 'public' },
    );
  });

  it('POST /api/upload should return 400 if no file is provided in the form data', async () => {
    const formData = new FormData();
    formData.append('something_else', 'not a file');

    const res = await authedRequest(
      '/api/upload',
      {
        method: 'POST',
        body: formData,
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(put).not.toHaveBeenCalled();
  });

  it('POST /api/upload should return 400 if the file type is not an image', async () => {
    const formData = new FormData();
    const txtFile = new File(['just some text'], 'test.txt', { type: 'text/plain' });
    formData.append('file', txtFile);

    const res = await authedRequest(
      '/api/upload',
      {
        method: 'POST',
        body: formData,
      },
      { id: TEST_USER_ID },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'File must be an image');
    expect(put).not.toHaveBeenCalled();
  });

  it('POST /api/upload should return 401 if the user is unauthenticated', async () => {
    const formData = new FormData();
    const file = new File(['dummy image content'], 'test.png', { type: 'image/png' });
    formData.append('file', file);

    const res = await request('/api/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(401);
    expect(put).not.toHaveBeenCalled();
  });
});
