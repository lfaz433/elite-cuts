const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const runTest = globalThis.test ?? require('node:test').test;
const test = Object.assign((name, fn) => runTest(name, fn), {
  each: values => (name, fn) => values.forEach((value, index) => runTest(`${name} [${index}]`, () => fn(value))),
});

const functionsDirectory = resolve(__dirname, '..', 'functions', 'src');
const functionModules = readdirSync(functionsDirectory)
  .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'runtime.ts');

// Match the builder root even across line breaks before .document(...).
const directBuilder = /\bfunctions\s*\.\s*(?:firestore|runWith|https\s*\.\s*(?:onCall|onRequest))\b/;

test.each([
  'functions.firestore.document("bookings/{id}")',
  'functions.firestore\n  .document("bookings/{id}")',
  'functions\n  .firestore\n  .document("bookings/{id}")',
])('detects a direct Firestore builder regardless of formatting: %s', source => {
  assert.match(source, directBuilder);
});

test('all deployed Function builders use the shared Europe region runtime', () => {
  const runtime = readFileSync(resolve(functionsDirectory, 'runtime.ts'), 'utf8');
  assert.ok(runtime.includes("export const FUNCTIONS_REGION = 'europe-west1'"));
  assert.ok(runtime.includes('export const europeFunctions = functions.region(FUNCTIONS_REGION)'));

  for (const moduleName of functionModules) {
    const source = readFileSync(resolve(functionsDirectory, moduleName), 'utf8');
    if (/\beuropeFunctions\b/.test(source)) assert.ok(source.includes("from './runtime'"), moduleName);
    assert.doesNotMatch(source, directBuilder, moduleName);
  }
});
