import * as admin from 'firebase-admin';

// Initialize the app only once
if (!admin.apps.length) {
  admin.initializeApp({
    // Hardcode the Project ID based on the client firebaseConfig. 
    // This allows verifyIdToken to work without needing the full service account private key,
    // which is useful in Vercel Edge/Serverless functions.
    projectId: 'elite-cuts-app'
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
