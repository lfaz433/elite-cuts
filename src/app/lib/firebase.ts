import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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
export const auth = getAuth(app);
