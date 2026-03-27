import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorize } from '../../../../src/services/auth/authorize.js';
import { authenticateUser } from '../../../../src/services/auth.service.js';

vi.mock('../../../../src/services/auth.service.js', () => ({
  authenticateUser: vi.fn(),
}));

describe('Auth - authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if credentials are not provided', async () => {
    const result = await authorize(null);
    expect(result).toBeNull();
    expect(authenticateUser).not.toHaveBeenCalled();
  });

  it('should return null if email is missing', async () => {
    const result = await authorize({ password: 'password123' });
    expect(result).toBeNull();
    expect(authenticateUser).not.toHaveBeenCalled();
  });

  it('should return null if password is missing', async () => {
    const result = await authorize({ email: 'test@example.com' });
    expect(result).toBeNull();
    expect(authenticateUser).not.toHaveBeenCalled();
  });

  it('should delegate to authenticateUser when credentials are valid', async () => {
    const mockUser = { id: 1, email: 'test@example.com' };
    vi.mocked(authenticateUser).mockResolvedValueOnce(mockUser as any);

    const result = await authorize({ email: 'test@example.com', password: 'password123' });

    expect(result).toEqual(mockUser);
    expect(authenticateUser).toHaveBeenCalledWith('test@example.com', 'password123');
  });
});
