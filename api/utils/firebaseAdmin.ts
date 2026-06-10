import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the app only once
if (!getApps().length) {
  let credential;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'elite-cuts-app',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    }
  } catch (error) {
    console.warn('Could not parse Firebase service account credentials.', error);
  }

  initializeApp({
    projectId: 'elite-cuts-app',
    ...(credential ? { credential } : {})
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
