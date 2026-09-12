import { initializeApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';

// Updated at: 2026-05-15 17:23:00
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

const referralAppCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim() || '';
const hasValidStagingReferralAppCheckConfig = firebaseConfig.projectId === 'elite-cuts-staging'
  && /^6[A-Za-z0-9_-]{20,}$/.test(referralAppCheckSiteKey);

function initializeReferralAppCheck(): AppCheck | null {
  if (!hasValidStagingReferralAppCheckConfig) return null;
  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(referralAppCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    return null;
  }
}

export const referralAppCheck = initializeReferralAppCheck();
export const referralAppCheckEnabled = referralAppCheck !== null;
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
