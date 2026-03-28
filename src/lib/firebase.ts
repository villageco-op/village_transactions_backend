import admin from 'firebase-admin';
import type { Messaging } from 'firebase-admin/messaging';

let messagingInstance: Messaging | null = null;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  messagingInstance = admin.messaging();
} catch (error) {
  console.error('Firebase Admin failed to initialize. Messaging features will be disabled.', error);
}

export const messaging = messagingInstance;
