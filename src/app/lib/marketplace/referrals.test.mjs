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
  hasShareableReferralCode,
  isActiveReferralCode,
  isShareableReferralCode,
  readCapturedReferralAttribution,
  REFERRAL_ATTRIBUTION_STORAGE_KEY,
  REFERRAL_ATTRIBUTION_TTL_MS,
  ReferralStorageUnavailableError,
  referralLink,
  referralCodeScopeForSurface,
  appendReferralWorkspaceHistory,
  referralCreditSummary,
  referralWorkspaceCanShare,
  referralWorkspaceSelectionMatches,
  referralWorkspaceMatchesSelection,
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

test('allows scoped code creation after program rollover leaves no server-shareable code', () => {
  const codes = [{ code: 'EC-OLD', ownerType: 'client', programId: 'program-old', status: 'active' }];
  assert.equal(hasShareableReferralCode(codes, { 'EC-OLD': false }), false);
  assert.equal(hasShareableReferralCode(codes, { 'EC-OLD': true }), true);
});

test('creates or retrieves codes using only the explicit authenticated scope', async () => {
  callableCalls.length = 0;
  callableResponses.set('createMyReferralCode', { data: {
    code: 'EC-CLIENT', ownerType: 'client', programId: 'program-a', reused: false,
  } });

  await createMyReferralCode({ type: 'client' });
  callableResponses.set('createMyReferralCode', { data: {
    code: 'EC-FREELANCER', ownerType: 'freelancer', programId: 'program-a', reused: false,
  } });
  await createMyReferralCode({ type: 'freelancer' });
  callableResponses.set('createMyReferralCode', { data: {
    code: 'EC-BRAND', ownerType: 'brand', programId: 'program-a', reused: false,
  } });
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

test('rejects a code creation response for a different owner scope', async () => {
  callableResponses.set('createMyReferralCode', { data: {
    code: 'WRONG-SCOPE', ownerType: 'freelancer', programId: 'program-a', reused: false,
  } });
  await assert.rejects(createMyReferralCode({ type: 'client' }), /invalid code/);
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

function roleSummary(overrides = {}) {
  return {
    pendingCount: 1,
    approvedCount: 2,
    rejectedCount: 3,
    cancelledCount: 4,
    flaggedPendingCount: 1,
    creditTotals: [{ currency: 'EUR', pendingMinor: 200, approvedMinor: 500 }],
    ...overrides,
  };
}

function workspaceResponse(overrides = {}) {
  return {
    contractVersion: 3,
    state: 'ready',
    scope: { type: 'client' },
    summary: {
      ownerType: 'client',
      state: 'verified',
      codeCount: 1,
      attributionCount: 1,
      currentCode: { code: 'CLIENT-A', programId: 'program-a', status: 'active' },
      inviter: roleSummary(),
      invitee: roleSummary({
        pendingCount: 0,
        approvedCount: 1,
        rejectedCount: 0,
        cancelledCount: 0,
        flaggedPendingCount: 0,
        creditTotals: [{ currency: 'USD', pendingMinor: 0, approvedMinor: 250 }],
      }),
    },
    attribution: {
      code: 'WELCOME-1',
      programId: 'program-a',
      inviterOwnerType: 'brand',
      expiresAt: '2026-10-01T00:00:00.000Z',
    },
    history: {
      role: 'inviter',
      items: [{
        id: 'reward-a',
        ownerType: 'client',
        role: 'inviter',
        amountMinor: 700,
        currency: 'EUR',
        status: 'approved',
        createdAt: '2026-09-01T00:00:00.000Z',
      }],
      nextPageToken: 'client_uid__reward-a__inviter',
      truncated: true,
    },
    ...overrides,
  };
}

test('requests and parses only the exact selected Workspace V3 scope and history cursor', async () => {
  callableCalls.length = 0;
  callableResponses.set('getMyReferralWorkspace', { data: workspaceResponse() });

  const workspace = await getMyReferralWorkspace({
    scope: { type: 'client' },
    role: 'inviter',
    limit: 10,
    pageToken: 'previous-page',
  });

  assert.deepEqual(callableCalls, [['getMyReferralWorkspace', {
    scope: { type: 'client' },
    role: 'inviter',
    limit: 10,
    pageToken: 'previous-page',
  }]]);
  assert.equal(workspace.contractVersion, 3);
  assert.deepEqual(workspace.scope, { type: 'client' });
  assert.equal(workspace.summary.currentCode?.code, 'CLIENT-A');
  assert.deepEqual(workspace.summary.inviter.creditTotals, [{ currency: 'EUR', pendingMinor: 200, approvedMinor: 500 }]);
  assert.deepEqual(workspace.summary.invitee.creditTotals, [{ currency: 'USD', pendingMinor: 0, approvedMinor: 250 }]);
  assert.deepEqual(workspace.history.items, [{
    id: 'reward-a', ownerType: 'client', role: 'inviter', amountMinor: 700, currency: 'EUR', status: 'approved', createdAt: '2026-09-01T00:00:00.000Z',
  }]);
  assert.equal(workspace.history.nextPageToken, 'client_uid__reward-a__inviter');
  assert.equal(workspace.history.truncated, true);
});

test('rejects an invalid workspace role or page bound before invoking the callable', async () => {
  callableCalls.length = 0;
  await assert.rejects(
    getMyReferralWorkspace({ scope: { type: 'brand', brandId: 'brand-b' }, role: 'invitee' }),
    /workspace request.*invalid/,
  );
  await assert.rejects(
    getMyReferralWorkspace({ scope: { type: 'client' }, role: 'inviter', limit: 21 }),
    /workspace request.*invalid/,
  );
  await assert.rejects(
    getMyReferralWorkspace({ scope: { type: 'client' }, role: 'inviter', pageToken: 'owner/reward' }),
    /workspace request.*invalid/,
  );
  assert.deepEqual(callableCalls, []);
});

test('sends client, freelancer, and exact brand workspace scopes without enumerating adjacent surfaces', async () => {
  callableCalls.length = 0;
  callableResponses.set('getMyReferralWorkspace', { data: workspaceResponse({
    scope: { type: 'client' },
    history: { role: 'invitee', items: [], truncated: false },
  }) });
  await getMyReferralWorkspace({ scope: { type: 'client' }, role: 'invitee', limit: 20 });

  callableResponses.set('getMyReferralWorkspace', { data: workspaceResponse({
    scope: { type: 'freelancer' },
    summary: { ...workspaceResponse().summary, ownerType: 'freelancer' },
    attribution: undefined,
    history: { role: 'inviter', items: [], truncated: false },
  }) });
  await getMyReferralWorkspace({ scope: { type: 'freelancer' }, role: 'inviter', limit: 10 });

  callableResponses.set('getMyReferralWorkspace', { data: {
    ...workspaceResponse({
      scope: { type: 'brand', brandId: 'brand-b' },
      summary: { ...workspaceResponse().summary, ownerType: 'brand' },
      attribution: undefined,
      history: { role: 'inviter', items: [], truncated: false },
    }),
  } });
  await getMyReferralWorkspace({ scope: { type: 'brand', brandId: 'brand-b' }, role: 'inviter', limit: 10 });

  assert.deepEqual(callableCalls, [
    ['getMyReferralWorkspace', { scope: { type: 'client' }, role: 'invitee', limit: 20 }],
    ['getMyReferralWorkspace', { scope: { type: 'freelancer' }, role: 'inviter', limit: 10 }],
    ['getMyReferralWorkspace', { scope: { type: 'brand', brandId: 'brand-b' }, role: 'inviter', limit: 10 }],
  ]);
});

test('keeps migration-required and uninitialized summaries explicit without accepting legacy data', async () => {
  callableResponses.set('getMyReferralWorkspace', { data: {
    contractVersion: 3,
    state: 'migrationRequired',
    scope: { type: 'brand', brandId: 'brand-b' },
    summary: {
      ownerType: 'brand', state: 'unavailable', codeCount: 0, attributionCount: 0,
      inviter: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
      invitee: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
    },
    history: { role: 'inviter', items: [], truncated: false },
    client: { ownerType: 'client', codes: [{ code: 'STALE', status: 'active' }] },
  } });
  const migration = await getMyReferralWorkspace({ scope: { type: 'brand', brandId: 'brand-b' }, role: 'inviter' });
  assert.equal(migration.state, 'migrationRequired');
  assert.equal(migration.summary.state, 'unavailable');
  assert.equal(migration.summary.currentCode, undefined);
  assert.deepEqual(migration.history.items, []);

  callableResponses.set('getMyReferralWorkspace', { data: workspaceResponse({
    summary: {
      ownerType: 'client', state: 'unavailable', codeCount: 0, attributionCount: 0,
      inviter: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
      invitee: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
    },
    attribution: undefined,
    history: { role: 'inviter', items: [], truncated: false },
  }) });
  const uninitialized = await getMyReferralWorkspace({ scope: { type: 'client' }, role: 'inviter' });
  assert.equal(uninitialized.state, 'ready');
  assert.equal(uninitialized.summary.state, 'unavailable');
});

test('appends only a same-scope same-role cursor page and preserves its fresh summary', () => {
  const first = workspaceResponse();
  const second = workspaceResponse({
    summary: { ...workspaceResponse().summary, inviter: roleSummary({ approvedCount: 3 }) },
    history: {
      role: 'inviter',
      items: [{ id: 'reward-b', ownerType: 'client', role: 'inviter', amountMinor: 200, currency: 'EUR', status: 'pending' }],
      truncated: false,
    },
  });
  const merged = appendReferralWorkspaceHistory(first, second);
  assert.deepEqual(merged.history.items.map(item => item.id), ['reward-a', 'reward-b']);
  assert.equal(merged.history.truncated, false);
  assert.equal(merged.history.nextPageToken, undefined);
  assert.equal(merged.summary.inviter.approvedCount, 3);
  assert.throws(() => appendReferralWorkspaceHistory(first, { ...second, scope: { type: 'freelancer' } }), /scope or role/);

  const migration = workspaceResponse({
    state: 'migrationRequired',
    summary: {
      ownerType: 'client', state: 'unavailable', codeCount: 0, attributionCount: 0,
      inviter: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
      invitee: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
    },
    attribution: undefined,
    history: { role: 'inviter', items: [], truncated: false },
  });
  assert.deepEqual(appendReferralWorkspaceHistory(first, migration).history.items, []);
});

test('rejects a stale workspace when brand or client history role changes during an async refresh', () => {
  const client = workspaceResponse();
  assert.equal(referralWorkspaceMatchesSelection(client, { type: 'client' }, 'inviter'), true);
  assert.equal(referralWorkspaceMatchesSelection(client, { type: 'client' }, 'invitee'), false);

  const brandA = workspaceResponse({
    scope: { type: 'brand', brandId: 'brand-a' },
    summary: { ...workspaceResponse().summary, ownerType: 'brand' },
    attribution: undefined,
    history: { role: 'inviter', items: [], truncated: false },
  });
  assert.equal(referralWorkspaceMatchesSelection(brandA, { type: 'brand', brandId: 'brand-a' }, 'inviter'), true);
  assert.equal(referralWorkspaceMatchesSelection(brandA, { type: 'brand', brandId: 'brand-b' }, 'inviter'), false);
});

test('suppresses a share side effect when its brand selection changes during async validation', async () => {
  const startingScope = { type: 'brand', brandId: 'brand-a' };
  let currentScope = startingScope;
  let releaseValidation;
  let shared = false;
  const validation = new Promise(resolve => { releaseValidation = resolve; });
  const pendingShare = validation.then(() => {
    if (referralWorkspaceSelectionMatches(startingScope, 'inviter', currentScope, 'inviter')) shared = true;
  });

  currentScope = { type: 'brand', brandId: 'brand-b' };
  releaseValidation();
  await pendingShare;
  assert.equal(shared, false);
});

test('suppresses deferred share after unmount, migration gate, or current-code invalidation', async () => {
  const scope = { type: 'client' };
  const runDeferred = async mutate => {
    let mounted = true;
    let currentWorkspace = workspaceResponse();
    let releaseValidation;
    let shared = false;
    const validation = new Promise(resolve => { releaseValidation = resolve; });
    const pendingShare = validation.then(() => {
      if (mounted && referralWorkspaceCanShare(currentWorkspace, scope, 'inviter', 'CLIENT-A')) shared = true;
    });
    const state = mutate({ mounted, currentWorkspace });
    mounted = state.mounted;
    currentWorkspace = state.currentWorkspace;
    releaseValidation();
    await pendingShare;
    return shared;
  };

  assert.equal(await runDeferred(state => ({ ...state, mounted: false })), false);
  assert.equal(await runDeferred(state => ({ ...state, currentWorkspace: workspaceResponse({
    state: 'migrationRequired',
    summary: {
      ownerType: 'client', state: 'unavailable', codeCount: 0, attributionCount: 0,
      inviter: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
      invitee: roleSummary({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] }),
    },
    attribution: undefined,
    history: { role: 'inviter', items: [], truncated: false },
  }) })), false);
  assert.equal(await runDeferred(state => ({ ...state, currentWorkspace: workspaceResponse({
    summary: { ...workspaceResponse().summary, currentCode: { code: 'CLIENT-B', programId: 'program-b', status: 'active' } },
  }) })), false);
  assert.equal(await runDeferred(state => ({ ...state, currentWorkspace: workspaceResponse({
    summary: { ...workspaceResponse().summary, currentCode: { code: 'CLIENT-A', programId: 'program-a', status: 'paused' } },
  }) })), false);
});

test('summarizes verified server credit totals without reconstructing them from bounded history', () => {
  assert.deepEqual(referralCreditSummary(roleSummary().creditTotals), [{
    currency: 'EUR', amountMinor: 700, pendingMinor: 200, approvedMinor: 500,
  }]);
  assert.deepEqual(referralCreditSummary([]), []);
});

test('rejects wrong versions, scope leaks, malformed money, and inconsistent history pagination', async () => {
  const request = { scope: { type: 'client' }, role: 'inviter' };
  const elevenItems = Array.from({ length: 11 }, (_, index) => ({
    id: `reward-${index}`, ownerType: 'client', role: 'inviter', amountMinor: 100, currency: 'EUR', status: 'approved',
  }));
  const malformed = [
    workspaceResponse({ contractVersion: 2 }),
    workspaceResponse({ scope: { type: 'brand', brandId: 'another-brand' } }),
    workspaceResponse({ summary: { ...workspaceResponse().summary, ownerType: 'freelancer' } }),
    workspaceResponse({ summary: { ...workspaceResponse().summary, inviter: roleSummary({ creditTotals: [{ currency: 'EUR', pendingMinor: 0.5, approvedMinor: 1 }] }) } }),
    workspaceResponse({ summary: { ...workspaceResponse().summary, inviter: roleSummary({ creditTotals: [{ currency: 'EUR', pendingMinor: 2, approvedMinor: Number.MAX_SAFE_INTEGER }] }) } }),
    workspaceResponse({ summary: { ...workspaceResponse().summary, state: 'unavailable', currentCode: undefined } }),
    workspaceResponse({ history: { role: 'inviter', items: [{ id: 'leak', ownerType: 'brand', role: 'inviter', amountMinor: 100, currency: 'EUR', status: 'approved' }], truncated: false } }),
    workspaceResponse({ history: { role: 'inviter', items: [{ id: 'bad-date', ownerType: 'client', role: 'inviter', amountMinor: 100, currency: 'EUR', status: 'approved', createdAt: 'not-a-date' }], truncated: false } }),
    workspaceResponse({ history: { role: 'invitee', items: [], truncated: false } }),
    workspaceResponse({ history: { role: 'inviter', items: [], truncated: true } }),
    workspaceResponse({ history: { role: 'inviter', items: [], nextPageToken: '', truncated: true } }),
    workspaceResponse({ history: { role: 'inviter', items: [], nextPageToken: 'owner/reward', truncated: true } }),
    workspaceResponse({ history: { role: 'inviter', items: [], nextPageToken: 'x'.repeat(257), truncated: true } }),
    workspaceResponse({ history: { role: 'inviter', items: elevenItems, truncated: false } }),
  ];
  for (const data of malformed) {
    callableResponses.set('getMyReferralWorkspace', { data });
    await assert.rejects(getMyReferralWorkspace(request), /invalid workspace/);
  }
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
