import { initializeApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// Updated at: 2026-05-15 17:23:00
export const firebaseConfig = {
  apiKey: "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4",
  authDomain: "elite-cuts-app.firebaseapp.com",
  projectId: "elite-cuts-app",
  storageBucket: "elite-cuts-app.firebasestorage.app",
  messagingSenderId: "499181564992",
  appId: "1:499181564992:web:afc888388b72144ccc9ba5",
  measurementId: "G-QDWD7EKPM7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable offline persistence
try {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
      console.warn('Persistence not supported by this browser');
    }
  });
} catch (e) {
  console.warn('Persistence error:', e);
}

export const auth = getAuth(app);
export const functions = getFunctions(app);
