import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the app only once
if (!getApps().length) {
  initializeApp({
    // Hardcode the Project ID based on the client firebaseConfig. 
    // This allows verifyIdToken to work without needing the full service account private key,
    // which is useful in Vercel Edge/Serverless functions.
    projectId: 'elite-cuts-app'
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
