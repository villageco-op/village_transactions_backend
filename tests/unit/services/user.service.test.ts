import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPException } from 'hono/http-exception';

import {
  getCurrentUser,
  registerFcmToken,
  updateCurrentUser,
} from '../../../src/services/user.service.js';
import { userRepository } from '../../../src/repositories/user.repository.js';

vi.mock('../../../src/repositories/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
    updateById: vi.fn(),
    updateFcmToken: vi.fn(),
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

  describe('updateCurrentUser', () => {
    it('should throw a 404 HTTPException if the user is not found during update', async () => {
      vi.mocked(userRepository.updateById).mockResolvedValueOnce(null);

      const updateData = { name: 'New Name' };

      await expect(updateCurrentUser('missing_user_id', updateData)).rejects.toThrow(HTTPException);
      await expect(updateCurrentUser('missing_user_id', updateData)).rejects.toMatchObject({
        status: 404,
      });

      expect(userRepository.updateById).toHaveBeenCalledWith('missing_user_id', updateData);
    });

    it('should update the user and return a sanitized user object (without passwordHash)', async () => {
      const updateData = {
        name: 'Updated Alice',
        address: '789 New St',
        deliveryRangeMiles: 20,
      };

      const mockDbUpdatedUser = {
        id: 'user_123',
        name: 'Updated Alice',
        email: 'alice@example.com',
        passwordHash: 'super_secret_hash', // Should be removed
        address: '789 New St',
        deliveryRangeMiles: '20',
      };

      vi.mocked(userRepository.updateById).mockResolvedValueOnce(mockDbUpdatedUser as any);

      const result = await updateCurrentUser('user_123', updateData);

      expect(result).toEqual({
        id: 'user_123',
        name: 'Updated Alice',
        email: 'alice@example.com',
        address: '789 New St',
        deliveryRangeMiles: '20',
      });

      // Explicitly verify the sensitive data was stripped
      expect(result).not.toHaveProperty('passwordHash');
      expect(userRepository.updateById).toHaveBeenCalledWith('user_123', updateData);
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
      vi.mocked(userRepository.updateFcmToken).mockResolvedValueOnce();

      await registerFcmToken('user_123', 'test_fcm_token_999', 'android');

      expect(userRepository.findById).toHaveBeenCalledWith('user_123');
      expect(userRepository.updateFcmToken).toHaveBeenCalledWith(
        'user_123',
        'test_fcm_token_999',
        'android',
      );
    });
  });
});
