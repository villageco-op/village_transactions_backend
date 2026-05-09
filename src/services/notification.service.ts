import { HTTPException } from 'hono/http-exception';

import { type AppLogger, noopLogger } from '../interfaces/logger.interface.js';
import { messaging } from '../lib/firebase.js';
import { fcmRepository } from '../repositories/fcm.repository.js';
import { userRepository } from '../repositories/user.repository.js';

/**
 * Dispatches an FCM push notification to a specific user.
 * @param userId - ID of the user receiving the notification
 * @param title - Notification Title
 * @param body - Notification Body message
 * @param log - App logger that defaults to a blank logger
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  log: AppLogger = noopLogger,
) {
  const tokenRecords = await fcmRepository.getTokensByUserId(userId);
  if (!tokenRecords.length) return;

  const registrationTokens = tokenRecords.map((t) => t.token);

  const message = {
    notification: { title, body },
    tokens: registrationTokens,
  };

  try {
    if (!messaging) throw new Error('FCM failed to load. Skipping push notification...');
    const response = await messaging.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(registrationTokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await fcmRepository.deleteTokens(invalidTokens);
        log.info({ count: invalidTokens.length }, 'Cleaned up stale FCM tokens');
      }
    }
  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : error }, 'FCM Dispatch Error');
  }
}

/**
 * Registers a Firebase Cloud Messaging token for the user's current device.
 * @param id - User's unique ID
 * @param token - FCM token
 * @param platform - Device platform identifier (e.g. 'ios', 'android', 'web')
 * @param log - App logger that defaults to a blank logger
 */
export async function registerFcmToken(
  id: string,
  token: string,
  platform: string,
  log: AppLogger = noopLogger,
) {
  const user = await userRepository.findById(id);

  if (!user) {
    log.warn('Attempted to register FCM token for non-existent user');
    throw new HTTPException(404, { message: 'User not found' });
  }

  await fcmRepository.upsertToken(id, token, platform);
  log.info({ platform }, 'FCM device token registered');
}
