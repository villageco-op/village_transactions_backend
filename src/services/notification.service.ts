import { HTTPException } from 'hono/http-exception';

import { messaging } from '../lib/firebase.js';
import { fcmRepository } from '../repositories/fcm.repository.js';
import { userRepository } from '../repositories/user.repository.js';

/**
 * Dispatches an FCM push notification to a specific user.
 * @param userId - ID of the user receiving the notification
 * @param title - Notification Title
 * @param body - Notification Body message
 */
export async function sendPushNotification(userId: string, title: string, body: string) {
  const tokenRecords = await fcmRepository.getTokensByUserId(userId);
  if (!tokenRecords.length) return;

  const registrationTokens = tokenRecords.map((t) => t.token);

  const message = {
    notification: { title, body },
    tokens: registrationTokens,
  };

  try {
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
        console.log(`Cleaned up ${invalidTokens.length} stale FCM tokens.`);
      }
    }
  } catch (error) {
    console.error('FCM Dispatch Error:', error);
  }
}

/**
 * Registers a Firebase Cloud Messaging token for the user's current device.
 * @param id - User's unique ID
 * @param token - FCM token
 * @param platform - Device platform identifier (e.g. 'ios', 'android', 'web')
 */
export async function registerFcmToken(id: string, token: string, platform: string) {
  const user = await userRepository.findById(id);

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  await fcmRepository.upsertToken(id, token, platform);
}
