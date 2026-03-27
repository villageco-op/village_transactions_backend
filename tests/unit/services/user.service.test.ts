import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import { getCurrentUser } from '../../../src/services/user.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

describe('UserService - getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a 404 HTTPException if the user is not found', async () => {
    vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

    await expect(getCurrentUser('missing_user_id')).rejects.toThrow(HTTPException);
    await expect(getCurrentUser('missing_user_id')).rejects.toMatchObject({ status: 404 });

    expect(userRepository.findById).toHaveBeenCalledWith('missing_user_id');
  });

  it('should return a sanitized user object (without passwordHash) if the user is found', async () => {
    const mockDbUser = {
      id: 'user_123',
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'super_secret_hash',
      address: '456 Seller Ave',
      stripeAccountId: 'acct_999',
      stripeOnboardingComplete: false,
    };

    vi.mocked(userRepository.findById).mockResolvedValueOnce(mockDbUser as any);

    const result = await getCurrentUser('user_123');

    // Ensure the returned object matches the DB record MINUS the passwordHash
    expect(result).toEqual({
      id: 'user_123',
      name: 'Alice',
      email: 'alice@example.com',
      address: '456 Seller Ave',
      stripeAccountId: 'acct_999',
      stripeOnboardingComplete: false,
    });

    // Explicitly verify the sensitive data was stripped
    expect(result).not.toHaveProperty('passwordHash');
    expect(userRepository.findById).toHaveBeenCalledWith('user_123');
  });
});
