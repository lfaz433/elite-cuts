import { initializeApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import {
  FIREBASE_FUNCTIONS_REGION,
  readFirebaseEnvironment,
} from './firebaseEnvironment';

const firebaseEnvironment = readFirebaseEnvironment(import.meta.env);
export const firebaseConfig = firebaseEnvironment.config;

const app = initializeApp(firebaseConfig);

function initializeConfiguredAppCheck(): AppCheck | null {
  if (!firebaseEnvironment.appCheckEnabled) return null;
  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(firebaseEnvironment.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    return null;
  }
}

export const appCheck = initializeConfiguredAppCheck();
export const appCheckEnabled = appCheck !== null;
// Retain the original referral imports while sharing one App Check instance.
export const referralAppCheck = appCheck;
export const referralAppCheckEnabled = appCheckEnabled;
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
export const functions = getFunctions(app, FIREBASE_FUNCTIONS_REGION);
