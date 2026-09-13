import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EXPECTED_FIREBASE_PROJECTS, assertFirebaseAliases } = require('./lib/firebase-targets.cjs');
const expectedConfirmation = EXPECTED_FIREBASE_PROJECTS.production;

try {
  assertFirebaseAliases(JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Firebase aliases are invalid.');
  process.exit(2);
}

if (process.env.CONFIRM_PRODUCTION_PROJECT !== expectedConfirmation) {
  console.error(`Production deploy refused. Set CONFIRM_PRODUCTION_PROJECT=${expectedConfirmation}.`);
  process.exit(2);
}

console.log('Production project confirmation accepted.');
