import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from '../../../functions/node_modules/typescript/lib/typescript.js';

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

// Exercise the initializer itself: a correct predicate is not enough if the
// Firebase module accidentally initializes App Check outside that gate.
function initializeFirebaseForTest(environment, initializationError) {
  const calls = []; const instance = {};
  const source = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env', 'testEnvironment');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: 'firebase.ts',
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'testEnvironment', output)(request => {
    if (request === './firebaseEnvironment') return { readFirebaseEnvironment, FIREBASE_FUNCTIONS_REGION };
    if (request === 'firebase/app') return { initializeApp: config => ({ config }) };
    if (request === 'firebase/firestore') return { getFirestore: () => ({}), enableMultiTabIndexedDbPersistence: async () => {} };
    if (request === 'firebase/auth') return { getAuth: () => ({}) };
    if (request === 'firebase/functions') return { getFunctions: () => ({}) };
    if (request === 'firebase/app-check') return {
      ReCaptchaV3Provider: class { constructor(siteKey) { this.siteKey = siteKey; } },
      initializeAppCheck(app, options) {
        calls.push({ app, options });
        if (initializationError) throw initializationError;
        return instance;
      },
    };
    throw new Error(`Unexpected dependency ${request}`);
  }, module, module.exports, environment);
  return { exports: module.exports, calls, instance };
}

test('a false flag never initializes App Check, even with a valid launch-project key', () => {
  const result = initializeFirebaseForTest({ ...validEnvironment, VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '6Laaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(result.calls.length, 0);
  assert.equal(result.exports.appCheck, null);
  assert.equal(result.exports.appCheckEnabled, false);
  assert.equal(result.exports.referralAppCheck, null);
  assert.equal(result.exports.referralAppCheckEnabled, false);
});

test('the true flag and valid launch config initialize generic App Check once with compatible referral aliases', () => {
  const result = initializeFirebaseForTest({ ...validEnvironment, VITE_FIREBASE_APPCHECK_ENABLED: 'true', VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '6Laaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].app.config.projectId, 'elitecuts-2fb0a');
  assert.equal(result.calls[0].options.provider.siteKey, '6Laaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.calls[0].options.isTokenAutoRefreshEnabled, true);
  assert.equal(result.exports.appCheck, result.instance);
  assert.equal(result.exports.appCheckEnabled, true);
  assert.equal(result.exports.referralAppCheck, result.exports.appCheck);
  assert.equal(result.exports.referralAppCheckEnabled, result.exports.appCheckEnabled);
});

test('invalid App Check keys and initialization failures fail closed; wrong projects are rejected', () => {
  const invalid = initializeFirebaseForTest({ ...validEnvironment, VITE_FIREBASE_APPCHECK_ENABLED: 'true', VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: 'invalid' });
  assert.equal(invalid.calls.length, 0); assert.equal(invalid.exports.appCheckEnabled, false);
  const failed = initializeFirebaseForTest({ ...validEnvironment, VITE_FIREBASE_APPCHECK_ENABLED: 'true', VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY: '6Laaaaaaaaaaaaaaaaaaaaaaa' }, new Error('unavailable'));
  assert.equal(failed.exports.appCheckEnabled, false); assert.equal(failed.exports.appCheck, null);
  assert.throws(() => initializeFirebaseForTest({ ...validEnvironment, VITE_FIREBASE_PROJECT_ID: 'other-project' }), /must be elitecuts-2fb0a/);
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
