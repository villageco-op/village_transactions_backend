import { describe, it, expect } from 'vitest';
import { jwtCallback, sessionCallback } from '../../../../src/services/auth/callbacks.js';

describe('Auth Callbacks', () => {
  describe('jwtCallback', () => {
    it('should attach user id to token if user is provided', async () => {
      const token = { iat: 123 };
      const user = { id: 'user-123' };

      const result = jwtCallback({ token, user });

      expect(result.id).toBe('user-123');
      expect(result.iat).toBe(123); // preserves existing data
    });

    it('should return unmodified token if user is not provided', async () => {
      const token = { iat: 123 };

      const result = jwtCallback({ token, user: undefined });

      expect(result.id).toBeUndefined();
      expect(result.iat).toBe(123);
    });
  });

  describe('sessionCallback', () => {
    it('should attach token id to session user if both exist', async () => {
      const session = { user: { email: 'test@example.com' }, expires: '5d' };
      const token = { id: 'user-123' };

      const result = sessionCallback({ session, token });

      expect(result.user?.id).toBe('user-123');
    });

    it('should not throw if session user is missing', async () => {
      const session = {} as any;
      const token = { id: 'user-123' };

      const result = sessionCallback({ session, token });

      expect(result).toEqual({}); // Remains unchanged
    });
  });
});
