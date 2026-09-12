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
const callableCalls = [];
const callableResponses = new Map();
const loaded = { exports: {} };
new Function('require', 'module', 'exports', output)(
  request => {
    if (request === 'firebase/functions') return {
      httpsCallable: (_functions, name) => async data => {
        callableCalls.push([name, data]);
        const response = callableResponses.get(name);
        if (response instanceof Error) throw response;
        return response;
      },
    };
    if (request === '../firebase') return { functions: {} };
    throw new Error(`Unexpected dependency: ${request}`);
  },
  loaded,
  loaded.exports,
);
const {
  captureReferralAttribution,
  createMyReferralCode,
  creditLabel,
  getMyReferralWorkspace,
  getPublicReferralCode,
  isActiveReferralCode,
  isShareableReferralCode,
  readCapturedReferralAttribution,
  REFERRAL_ATTRIBUTION_STORAGE_KEY,
  REFERRAL_ATTRIBUTION_TTL_MS,
  ReferralStorageUnavailableError,
  referralLink,
  referralCodeScopeForSurface,
  referralWorkspaceForScope,
  runWithReferralActionLock,
  validateAndCaptureReferralCode,
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

test('creates or retrieves codes using only the explicit authenticated scope', async () => {
  callableCalls.length = 0;
  callableResponses.set('createMyReferralCode', { data: {
    code: 'EC-CLIENT', ownerType: 'client', programId: 'program-a', reused: false,
  } });

  await createMyReferralCode({ type: 'client' });
  await createMyReferralCode({ type: 'freelancer' });
  await createMyReferralCode({ type: 'brand', brandId: 'brand-b' });
  assert.deepEqual(callableCalls, [
    ['createMyReferralCode', { scope: { type: 'client' } }],
    ['createMyReferralCode', { scope: { type: 'freelancer' } }],
    ['createMyReferralCode', { scope: { type: 'brand', brandId: 'brand-b' } }],
  ]);
  assert.deepEqual(referralCodeScopeForSurface('client'), { type: 'client' });
  assert.deepEqual(referralCodeScopeForSurface('freelancer'), { type: 'freelancer' });
  assert.deepEqual(referralCodeScopeForSurface('brand', 'brand-b'), { type: 'brand', brandId: 'brand-b' });
  assert.equal(referralCodeScopeForSurface('brand'), null);
});

test('accepts a link for sharing only after public server validation', async () => {
  callableCalls.length = 0;
  callableResponses.set('getPublicReferralCode', { data: { code: 'EC-CLIENT', status: 'active' } });

  const verified = await getPublicReferralCode('ec-client');
  assert.equal(isShareableReferralCode({ code: 'EC-CLIENT', ownerType: 'client', programId: 'program-a', status: 'active' }, verified), true);
  assert.equal(isShareableReferralCode({ code: 'EC-PAUSED', ownerType: 'client', programId: 'program-a', status: 'active' }, verified), false);
  assert.deepEqual(callableCalls, [['getPublicReferralCode', { code: 'ec-client' }]]);
});

test('releases the referral action lock after failed validation so the user can retry', async () => {
  const lock = { current: null };
  await assert.rejects(
    runWithReferralActionLock(lock, 'EC-CLIENT', async () => { throw new Error('unavailable'); }),
    /unavailable/,
  );
  assert.equal(lock.current, null);

  let retried = false;
  assert.equal(await runWithReferralActionLock(lock, 'EC-CLIENT', async () => { retried = true; }), true);
  assert.equal(retried, true);
  assert.equal(lock.current, null);
});

test('parses and keeps type-preserving nested workspaces isolated by surface', async () => {
  callableResponses.set('getMyReferralWorkspace', { data: {
    client: {
      ownerType: 'client',
      codes: [{ code: 'CLIENT-A', ownerType: 'client', programId: 'program-a', status: 'active' }],
      attribution: { code: 'WELCOME-1', programId: 'program-a' },
      inviterRewards: [{ id: 'client-inviter', ownerType: 'client', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }],
      inviteeRewards: [{ id: 'client-invitee', ownerType: 'client', role: 'invited', amountMinor: 200, currency: 'EUR', status: 'pending' }],
    },
    freelancer: {
      ownerType: 'freelancer',
      codes: [{ code: 'FREELANCER-A', ownerType: 'freelancer', programId: 'program-a', status: 'active' }],
      inviterRewards: [{ id: 'freelancer-inviter', ownerType: 'freelancer', role: 'inviter', amountMinor: 300, currency: 'EUR', status: 'approved' }],
    },
    brandWorkspaces: [
      { ownerType: 'brand', brandId: 'brand-a', codes: [{ code: 'BRAND-A', ownerType: 'brand', programId: 'program-a', status: 'active' }], rewards: [{ id: 'brand-a-reward', ownerType: 'brand', role: 'inviter', amountMinor: 300, currency: 'EUR', status: 'approved' }], creditTotals: [{ currency: 'EUR', approvedMinor: 300, pendingMinor: 0 }] },
      { ownerType: 'brand', brandId: 'brand-b', codes: [{ code: 'BRAND-B', ownerType: 'brand', programId: 'program-a', status: 'active' }], rewards: [{ id: 'brand-b-reward', ownerType: 'brand', role: 'inviter', amountMinor: 700, currency: 'EUR', status: 'approved' }], creditTotals: [{ currency: 'EUR', approvedMinor: 500, pendingMinor: 200 }] },
    ],
  } });
  const workspace = await getMyReferralWorkspace();

  assert.deepEqual(referralWorkspaceForScope(workspace, 'brand', 'brand-b').codes.map(code => code.code), ['BRAND-B']);
  assert.deepEqual(referralWorkspaceForScope(workspace, 'brand', 'brand-b').rewards.map(reward => reward.id), ['brand-b-reward']);
  assert.deepEqual(referralWorkspaceForScope(workspace, 'brand', 'brand-b').creditTotals, [{ currency: 'EUR', approvedMinor: 500, pendingMinor: 200 }]);
  assert.deepEqual(referralWorkspaceForScope(workspace, 'client').codes.map(code => code.code), ['CLIENT-A']);
  assert.deepEqual(referralWorkspaceForScope(workspace, 'client').rewards.map(reward => reward.id), ['client-inviter', 'client-invitee']);
  assert.equal(referralWorkspaceForScope(workspace, 'client').attribution?.code, 'WELCOME-1');
  assert.deepEqual(referralWorkspaceForScope(workspace, 'freelancer').rewards.map(reward => reward.id), ['freelancer-inviter']);
  assert.equal(referralWorkspaceForScope(workspace, 'freelancer').attribution, undefined);
});

test('does not place mismatched or untyped rewards into another referral surface', async () => {
  callableResponses.set('getMyReferralWorkspace', { data: {
    client: {
      ownerType: 'client', codes: [], inviterRewards: [
        { id: 'wrong-owner', ownerType: 'freelancer', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' },
        { id: 'legacy-untyped', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' },
      ], inviteeRewards: [],
    },
    freelancer: { ownerType: 'freelancer', codes: [], inviterRewards: [] },
  } });
  const workspace = await getMyReferralWorkspace();
  assert.deepEqual(referralWorkspaceForScope(workspace, 'client').rewards, []);
});

test('validates a public code before evaluating a local storage getter', async () => {
  const events = [];
  const storageProvider = () => {
    events.push('storage-getter');
    return { setItem: () => events.push('storage') };
  };
  const validate = async code => {
    events.push(`validate:${code}`);
    throw new Error('unavailable');
  };

  await assert.rejects(validateAndCaptureReferralCode('EC-CLIENT', storageProvider, validate), /unavailable/);
  assert.deepEqual(events, ['validate:EC-CLIENT']);
});

test('reports a blocked storage getter only after public validation succeeds', async () => {
  const events = [];
  const storageProvider = () => {
    events.push('storage-getter');
    throw new Error('blocked');
  };
  const validate = async code => {
    events.push(`validate:${code}`);
    return { code: 'EC-CLIENT', status: 'active' };
  };

  await assert.rejects(
    validateAndCaptureReferralCode('EC-CLIENT', storageProvider, validate),
    error => error instanceof ReferralStorageUnavailableError,
  );
  assert.deepEqual(events, ['validate:EC-CLIENT', 'storage-getter']);
});
