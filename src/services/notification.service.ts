import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { fcmTokens } from '../db/schema.js';

/**
 * Dispatches an FCM push notification to a specific user.
 * @param userId - ID of the user receiving the notification
 * @param title - Notification Title
 * @param body - Notification Body message
 */
export async function sendPushNotification(userId: string, title: string, body: string) {
  const tokens = await db.select().from(fcmTokens).where(eq(fcmTokens.userId, userId));

  if (!tokens || tokens.length === 0) return;

  // TODO: Integrate with firebase-admin SDK here.
  for (const tokenRecord of tokens) {
    console.log(`[FCM Mock] Sending to ${tokenRecord.platform} (${tokenRecord.token}):`);
    console.log(`Title: ${title} | Body: ${body}`);
  }
}
