import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { authenticateUser } from '../../../src/services/auth.service.js';
import { userRepository } from '../../../src/repositories/index.js';

vi.mock('bcryptjs');
vi.mock('../../../src/repositories/index.js', () => ({
  userRepository: {
    findByEmail: vi.fn(),
  },
}));

describe('AuthService - authenticateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if user is not found', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);

    const result = await authenticateUser('test@example.com', 'password123');

    expect(result).toBeNull();
    expect(userRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('should return null if user has no passwordHash (e.g. OAuth user)', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce({
      id: 1,
      email: 'test@example.com',
      passwordHash: null,
    } as any);

    const result = await authenticateUser('test@example.com', 'password123');

    expect(result).toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('should return null if password does not match', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce({
      id: 1,
      email: 'test@example.com',
      passwordHash: 'hashed_pw',
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    const result = await authenticateUser('test@example.com', 'wrong_password');

    expect(result).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong_password', 'hashed_pw');
  });

  it('should return sanitized user object if credentials are valid', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValueOnce({
      id: 1,
      name: 'John',
      email: 'test@example.com',
      image: 'url',
      passwordHash: 'hashed_pw',
      extraField: 'secret',
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    const result = await authenticateUser('test@example.com', 'correct_password');

    // Ensure sensitive fields like passwordHash and extraField are stripped
    expect(result).toEqual({
      id: 1,
      name: 'John',
      email: 'test@example.com',
      image: 'url',
    });
  });
});
