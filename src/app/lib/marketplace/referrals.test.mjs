import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

const filename = resolve(import.meta.dirname, 'referrals.ts');
const source = readFileSync(filename, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', output)(
  request => {
    if (request === 'firebase/functions') return { httpsCallable: () => () => undefined };
    if (request === '../firebase') return { functions: {} };
    throw new Error(`Unexpected dependency: ${request}`);
  },
  loaded,
  loaded.exports,
);
const {
  captureReferralAttribution,
  creditLabel,
  isActiveReferralCode,
  readCapturedReferralAttribution,
  REFERRAL_ATTRIBUTION_STORAGE_KEY,
  REFERRAL_ATTRIBUTION_TTL_MS,
  referralLink,
} = loaded.exports;

test('builds a share link from the supplied origin and referral code', () => {
  assert.equal(referralLink('https://staging.elitecuts.example', 'PARIS-5'), 'https://staging.elitecuts.example/r/PARIS-5');
});

test('formats EUR minor units as a French credit amount', () => {
  assert.equal(creditLabel({ amountMinor: 500, currency: 'EUR' }), '5,00 €');
});

test('stores a normalized referral code with a 30-day expiry', () => {
  const writes = [];
  const storage = { setItem: (key, value) => writes.push([key, value]) };

  assert.deepEqual(captureReferralAttribution(' paris-5 ', storage, 1_000), {
    code: 'PARIS-5',
    capturedAt: 1_000,
    expiresAt: 1_000 + REFERRAL_ATTRIBUTION_TTL_MS,
  });
  assert.deepEqual(writes, [[REFERRAL_ATTRIBUTION_STORAGE_KEY, JSON.stringify({
    code: 'PARIS-5',
    capturedAt: 1_000,
    expiresAt: 1_000 + REFERRAL_ATTRIBUTION_TTL_MS,
  })]]);
});

test('removes captured referral attribution after its expiry', () => {
  const removed = [];
  const storage = {
    getItem: () => JSON.stringify({ code: 'PARIS-5', capturedAt: 1_000, expiresAt: 2_000 }),
    removeItem: key => removed.push(key),
  };

  assert.equal(readCapturedReferralAttribution(storage, 2_000), null);
  assert.deepEqual(removed, [REFERRAL_ATTRIBUTION_STORAGE_KEY]);
});

test('rejects a locally captured code that the callable would reject', () => {
  const writes = [];
  const storage = { setItem: (key, value) => writes.push([key, value]) };

  assert.equal(captureReferralAttribution('-PARIS', storage, 1_000), null);
  assert.deepEqual(writes, []);
});

test('marks only active referral codes as shareable', () => {
  assert.equal(isActiveReferralCode('active'), true);
  assert.equal(isActiveReferralCode('paused'), false);
  assert.equal(isActiveReferralCode('archived'), false);
});
