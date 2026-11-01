import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EXPECTED_FIREBASE_PROJECTS, assertFirebaseAliases } = require('./lib/firebase-targets.cjs');
const target = process.argv[2];

if (target !== 'launch') {
  console.error('Firebase deploy target must be launch.');
  process.exit(2);
}

try {
  const firebaseRc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));
  assertFirebaseAliases(firebaseRc);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Firebase aliases are invalid.');
  process.exit(2);
}

if (process.env.CONFIRM_LAUNCH_PROJECT !== EXPECTED_FIREBASE_PROJECTS.launch) {
  console.error(`Launch deploy refused. Set CONFIRM_LAUNCH_PROJECT=${EXPECTED_FIREBASE_PROJECTS.launch}.`);
  process.exit(2);
}

console.log(`${target} Firebase target verified.`);
