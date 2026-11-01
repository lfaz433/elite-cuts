import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FIREBASE_FUNCTIONS_REGION,
  LAUNCH_FIREBASE_PROJECT_ID,
  firebaseFunctionUrl,
  readFirebaseEnvironment,
  shouldEnableFirebaseAppCheck,
} from './firebaseEnvironment.ts';

const validEnvironment = {
  VITE_FIREBASE_API_KEY: 'public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'elitecuts-2fb0a.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'elitecuts-2fb0a',
  VITE_FIREBASE_STORAGE_BUCKET: 'elitecuts-2fb0a.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-ABC123',
  VITE_FIREBASE_APPCHECK_ENABLED: 'false',
  VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '',
};

test('accepts the founder-owned Firebase configuration and generates European Function URLs', () => {
  const environment = readFirebaseEnvironment(validEnvironment);

  assert.equal(LAUNCH_FIREBASE_PROJECT_ID, 'elitecuts-2fb0a');
  assert.equal(FIREBASE_FUNCTIONS_REGION, 'europe-west1');
  assert.equal(environment.config.projectId, LAUNCH_FIREBASE_PROJECT_ID);
  assert.equal(
    firebaseFunctionUrl('transitionBookingStatus'),
    'https://europe-west1-elitecuts-2fb0a.cloudfunctions.net/transitionBookingStatus',
  );
});

test('rejects a legacy Firebase project and malformed Function names', () => {
  assert.throws(
    () => readFirebaseEnvironment({ ...validEnvironment, VITE_FIREBASE_PROJECT_ID: 'elite-cuts-app' }),
    /must be elitecuts-2fb0a/,
  );
  assert.throws(() => firebaseFunctionUrl('invalid/function'), /valid Function name/);
});

test('enables App Check only when explicitly enabled for the launch project with a valid site key', () => {
  assert.equal(shouldEnableFirebaseAppCheck(validEnvironment), false);
  assert.equal(shouldEnableFirebaseAppCheck({
    ...validEnvironment,
    VITE_FIREBASE_APPCHECK_ENABLED: 'true',
  }), false);
  assert.equal(shouldEnableFirebaseAppCheck({
    ...validEnvironment,
    VITE_FIREBASE_APPCHECK_ENABLED: 'true',
    VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '6Laaaaaaaaaaaaaaaaaaaaaaa',
  }), true);
});

test('client booking actions use the shared European Function URL and billing cannot open live Stripe Checkout', () => {
  const businessContext = readFileSync(
    fileURLToPath(new URL('../components/context/BusinessContext.tsx', import.meta.url)),
    'utf8',
  );
  const billing = readFileSync(
    fileURLToPath(new URL('../components/pages/Billing.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(businessContext, /firebaseFunctionUrl/);
  assert.doesNotMatch(businessContext, /us-central1/);
  assert.doesNotMatch(billing, /createCheckoutSession|cloudfunctions\.net/);
});
