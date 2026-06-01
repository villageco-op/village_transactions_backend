import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendPushNotification,
  registerFcmToken,
  unregisterFcmToken,
  getFcmStatus,
} from '../../../src/services/notification.service.ts';
import { fcmRepository } from '../../../src/repositories/fcm.repository.ts';
import { messaging } from '../../../src/lib/firebase.ts';

vi.mock('../../../src/repositories/fcm.repository.ts', () => ({
  fcmRepository: {
    getTokensByUserId: vi.fn(),
    deleteTokens: vi.fn(),
    upsertToken: vi.fn(),
    deleteByPlatform: vi.fn(),
    getTokensByPlatform: vi.fn(),
  },
}));

vi.mock('../../../src/lib/firebase.ts', () => ({
  messaging: {
    sendEachForMulticast: vi.fn(),
  },
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendPushNotification', () => {
    const userId = 'user_999';
    const title = 'Test Title';
    const body = 'Test Body';

    it('should return early if no registration tokens are found for the user', async () => {
      vi.mocked(fcmRepository.getTokensByUserId).mockResolvedValueOnce([]);

      await sendPushNotification(userId, title, body, mockLogger as any);

      expect(fcmRepository.getTokensByUserId).toHaveBeenCalledWith(userId);
      expect(messaging!.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('should log an error if firebase messaging fails to load', async () => {
      vi.mocked(fcmRepository.getTokensByUserId).mockResolvedValueOnce([
        { token: 'token_1' },
      ] as any);

      // Temporarily sabotage messaging to simulate a load failure
      const originalMessaging = messaging;
      (messaging as any) = null;

      await sendPushNotification(userId, title, body, mockLogger as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'FCM failed to load. Skipping push notification...' }),
        'FCM Dispatch Error',
      );

      // Restore messaging reference
      (messaging as any) = originalMessaging;
    });

    it('should successfully send a multicast notification when all tokens are valid', async () => {
      const tokens = [{ token: 'token_1' }, { token: 'token_2' }];
      vi.mocked(fcmRepository.getTokensByUserId).mockResolvedValueOnce(tokens as any);
      vi.mocked(messaging!.sendEachForMulticast).mockResolvedValueOnce({
        failureCount: 0,
        successCount: 2,
        responses: [
          { success: true, messageId: 'msg_1' },
          { success: true, messageId: 'msg_2' },
        ],
      });

      await sendPushNotification(userId, title, body, mockLogger as any);

      expect(messaging!.sendEachForMulticast).toHaveBeenCalledWith({
        notification: { title, body },
        tokens: ['token_1', 'token_2'],
      });
      expect(fcmRepository.deleteTokens).not.toHaveBeenCalled();
    });

    it('should filter and delete expired or invalid registration tokens matching specific error codes', async () => {
      const tokens = [
        { token: 'token_valid' },
        { token: 'token_expired' },
        { token: 'token_invalid' },
      ];
      vi.mocked(fcmRepository.getTokensByUserId).mockResolvedValueOnce(tokens as any);

      vi.mocked(messaging!.sendEachForMulticast).mockResolvedValueOnce({
        failureCount: 2,
        successCount: 0,
        responses: [
          { success: true, messageId: 'msg_1' },
          {
            success: false,
            error: {
              code: 'messaging/registration-token-not-registered',
              message: 'Expired',
            } as any,
          },
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token', message: 'Invalid' } as any,
          },
        ],
      });

      await sendPushNotification(userId, title, body, mockLogger as any);

      expect(fcmRepository.deleteTokens).toHaveBeenCalledWith(['token_expired', 'token_invalid']);
      expect(mockLogger.info).toHaveBeenCalledWith({ count: 2 }, 'Cleaned up stale FCM tokens');
    });

    it('should catch unhandled operational errors during the dispatch phase and log them', async () => {
      vi.mocked(fcmRepository.getTokensByUserId).mockResolvedValueOnce([
        { token: 'token_1' },
      ] as any);
      vi.mocked(messaging!.sendEachForMulticast).mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      await sendPushNotification(userId, title, body, mockLogger as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: 'Network timeout' },
        'FCM Dispatch Error',
      );
    });
  });

  describe('registerFcmToken', () => {
    it('should forward parameters to fcmRepository.upsertToken and log confirmation', async () => {
      const id = 'user_123';
      const token = 'fcm_token_abc';
      const platform = 'ios';

      await registerFcmToken(id, token, platform, mockLogger as any);

      expect(fcmRepository.upsertToken).toHaveBeenCalledWith(id, token, platform);
      expect(mockLogger.info).toHaveBeenCalledWith({ platform }, 'FCM device token registered');
    });
  });

  describe('unregisterFcmToken', () => {
    it('should target the correct platform records for deletion via the repository and log confirmation', async () => {
      const id = 'user_123';
      const platform = 'android';

      await unregisterFcmToken(id, platform, mockLogger as any);

      expect(fcmRepository.deleteByPlatform).toHaveBeenCalledWith(id, platform);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { platform },
        'FCM device tokens unregistered for platform',
      );
    });
  });

  describe('getFcmStatus', () => {
    const id = 'user_123';
    const platform = 'web';

    it('should return true if one or more valid tokens are present for the given profile and platform', async () => {
      vi.mocked(fcmRepository.getTokensByPlatform).mockResolvedValueOnce([
        { token: 'token_web_1' },
      ] as any);

      const status = await getFcmStatus(id, platform);

      expect(fcmRepository.getTokensByPlatform).toHaveBeenCalledWith(id, platform);
      expect(status).toBe(true);
    });

    it('should return false if no matching platform configurations are found', async () => {
      vi.mocked(fcmRepository.getTokensByPlatform).mockResolvedValueOnce([]);

      const status = await getFcmStatus(id, platform);

      expect(fcmRepository.getTokensByPlatform).toHaveBeenCalledWith(id, platform);
      expect(status).toBe(false);
    });
  });
});
