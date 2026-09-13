import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

function loadDashboard() {
  const filename = resolve(import.meta.dirname, 'ReferralMarketingDashboard.tsx');
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => {
    if (request === 'react' || request === 'react/jsx-runtime') return {};
    if (request === 'firebase/functions') return { httpsCallable: () => () => undefined };
    if (request === 'lucide-react') return {};
    if (request === 'sonner') return { toast: {} };
    if (request === '../../lib/firebase') return { functions: {} };
    throw new Error(`Unexpected module: ${request}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}

test('exports a literal V3 epoch and non-pageable top-referrer contract', () => {
  const filename = resolve(import.meta.dirname, 'ReferralMarketingDashboard.contract.test.ts');
  const program = ts.createProgram([filename], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    types: ['vite/client'],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).map(diagnostic => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
  assert.deepEqual(diagnostics, []);
});

function page(items, nextPageToken) {
  return { items, ...(nextPageToken ? { nextPageToken } : {}), truncated: Boolean(nextPageToken) };
}

function overviewFixture() {
  const pendingReward = {
    id: 'reward-1', programId: 'program-1', bookingId: 'booking-1', inviterId: 'inviter-1',
    invitedUserId: 'invitee-1', inviterCreditMinor: 500, invitedDiscountMinor: 300,
    currency: 'EUR', status: 'pending', createdAt: '2026-09-10T08:30:00.000Z',
    fraudFlag: { status: 'flagged', reason: 'Identités concordantes' },
  };
  return {
    contractVersion: 3,
    state: 'ready',
    summaryEpoch: 'referral-v3',
    telemetry: { state: 'verified', validatedVisits: 15, capped: false },
    programs: page([{
      id: 'program-1', status: 'active', countryCodes: ['FR', 'BE'], currency: 'EUR',
      inviterCreditMinor: 500, invitedDiscountMinor: 300,
      startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.999Z',
    }], 'program-cursor'),
    funnel: {
      codes: 20, validatedVisits: 15, attributions: 10, attributedSignups: 10,
      rewards: 8, eligibleFirstBookings: 8, pending: 3, pendingRewards: 3,
      approved: 3, approvedRewards: 3, rejected: 1, cancelled: 1,
    },
    approvedCreditTotals: [{ currency: 'EUR', amountMinor: 4_200 }, { currency: 'USD', amountMinor: 900 }],
    topReferrers: { items: [{
      inviterId: 'same-id', inviterOwnerType: 'brand', referrals: 4, rewards: 3,
      approvedCreditTotals: [{ currency: 'EUR', amountMinor: 1_000 }],
    }], truncated: true },
    pendingRewards: page([pendingReward], 'pending-cursor'),
    flaggedRewards: page([structuredClone(pendingReward)], 'flagged-cursor'),
    auditTrail: page([{
      id: 'audit-1', action: 'REFERRAL_REWARD_FLAGGED', programId: 'program-1', rewardId: 'reward-1',
      code: 'ABC-123', actorUid: 'admin-1', reason: 'Identités concordantes',
      createdAt: '2026-09-10T08:35:00.000Z',
    }], 'audit-cursor'),
  };
}

function migrationFixture() {
  return {
    contractVersion: 3,
    state: 'migrationRequired',
    summaryEpoch: 'referral-v3',
    telemetry: { state: 'unavailable', validatedVisits: 0, capped: false },
    programs: page([]),
    funnel: {
      codes: 0, validatedVisits: 0, attributions: 0, attributedSignups: 0,
      rewards: 0, eligibleFirstBookings: 0, pending: 0, pendingRewards: 0,
      approved: 0, approvedRewards: 0, rejected: 0, cancelled: 0,
    },
    approvedCreditTotals: [],
    topReferrers: page([]),
    pendingRewards: page([]),
    flaggedRewards: page([]),
    auditTrail: page([]),
  };
}

test('calculates referral funnel conversion rates from real counts', () => {
  const { funnelRate } = loadDashboard();
  assert.equal(funnelRate(5, 20), 25);
  assert.equal(funnelRate(1, 0), 0);
});

test('describes unavailable telemetry without presenting zero as a verified count', () => {
  const { telemetryText } = loadDashboard();
  assert.equal(telemetryText({ state: 'unavailable', validatedVisits: 0, capped: false }), 'Télémétrie indisponible');
  assert.equal(telemetryText({ state: 'verified', validatedVisits: 0, capped: false }), '0 visite(s) validée(s)');
  assert.match(telemetryText({ state: 'verified', validatedVisits: 1_000_000, capped: true }), /plafond atteint/i);
});

test('parses every nested value in the exact V3 overview contract', () => {
  const { parseReferralMarketingOverview, referrerKey } = loadDashboard();
  const overview = parseReferralMarketingOverview(overviewFixture());
  assert.equal(overview.contractVersion, 3);
  assert.equal(overview.state, 'ready');
  assert.equal(overview.summaryEpoch, 'referral-v3');
  assert.deepEqual(overview.programs.items[0].countryCodes, ['FR', 'BE']);
  assert.equal(overview.programs.nextPageToken, 'program-cursor');
  assert.equal(overview.funnel.cancelled, 1);
  assert.equal(overview.approvedCreditTotals[1].currency, 'USD');
  assert.equal(referrerKey(overview.topReferrers.items[0]), 'brand:same-id');
  assert.equal(overview.pendingRewards.items[0].fraudFlag.reason, 'Identités concordantes');
  assert.equal(overview.flaggedRewards.items[0].fraudFlag.status, 'flagged');
  assert.equal(overview.auditTrail.items[0].actorUid, 'admin-1');
});

test('accepts only the canonical empty migration-required envelope', () => {
  const { parseReferralMarketingOverview, canInitializeReferralOverview } = loadDashboard();
  const migration = parseReferralMarketingOverview(migrationFixture());
  assert.equal(migration.state, 'migrationRequired');
  assert.equal(canInitializeReferralOverview(migration), true);
  assert.equal(canInitializeReferralOverview(parseReferralMarketingOverview(overviewFixture())), false);
  const fabricatedMetrics = migrationFixture();
  fabricatedMetrics.funnel.codes = 1;
  assert.equal(parseReferralMarketingOverview(fabricatedMetrics), null);
  const fabricatedPage = migrationFixture();
  fabricatedPage.auditTrail = page([{ id: 'audit-1', action: 'REFERRAL_REWARD_APPROVED' }]);
  assert.equal(parseReferralMarketingOverview(fabricatedPage), null);
});

test('rejects an incompatible version, epoch, state, or telemetry contract', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const mutate of [
    value => { value.contractVersion = 2; },
    value => { value.summaryEpoch = 'legacy'; },
    value => { value.state = 'initializing'; },
    value => { value.telemetry.state = 'unknown'; },
    value => { value.telemetry.validatedVisits = 14; },
    value => { value.telemetry.capped = true; },
  ]) {
    const malformed = overviewFixture();
    mutate(malformed);
    assert.equal(parseReferralMarketingOverview(malformed), null);
  }
});

test('rejects malformed page metadata and never treats a partial collection as complete', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const mutate of [
    value => { value.programs = { items: value.programs.items, truncated: true }; },
    value => { value.pendingRewards = { items: value.pendingRewards.items, nextPageToken: 'cursor', truncated: false }; },
    value => { value.auditTrail.nextPageToken = 'bad/token'; },
    value => { value.topReferrers.nextPageToken = 'ranking-is-not-pageable'; },
    value => { value.topReferrers.items = Array.from({ length: 11 }, (_, index) => ({
      inviterId: `owner-${index}`, inviterOwnerType: 'client', referrals: 1, rewards: 0, approvedCreditTotals: [],
    })); },
  ]) {
    const malformed = overviewFixture();
    mutate(malformed);
    assert.equal(parseReferralMarketingOverview(malformed), null);
  }
});

test('allows independently paged flagged rewards without requiring them in the pending page', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const independentPages = overviewFixture();
  independentPages.pendingRewards = page([], 'pending-cursor');
  assert.ok(parseReferralMarketingOverview(independentPages));
});

test('rejects malformed currencies, unsafe numeric values, aliases, and duplicate row identities', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const mutate of [
    value => { value.approvedCreditTotals[0].currency = 'EURO'; },
    value => { value.pendingRewards.items[0].inviterCreditMinor = Number.NaN; },
    value => { value.funnel.approvedRewards = value.funnel.approved + 1; },
    value => { value.funnel.cancelled = value.funnel.cancelled + 1; },
    value => { value.programs.items.push(structuredClone(value.programs.items[0])); },
  ]) {
    const malformed = overviewFixture();
    mutate(malformed);
    assert.equal(parseReferralMarketingOverview(malformed), null);
  }
});

test('rejects malformed nested fraud flags rather than exposing them to rendering', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const malformed = overviewFixture();
  malformed.pendingRewards.items[0].fraudFlag = { status: 'flagged', reason: 42 };
  assert.equal(parseReferralMarketingOverview(malformed), null);
  const missingFlag = overviewFixture();
  missingFlag.flaggedRewards.items[0].fraudFlag = { status: 'cleared', reason: 'Déjà traité' };
  assert.equal(parseReferralMarketingOverview(missingFlag), null);
});

test('rejects malformed optional audit data, dates, and oversized audit pages', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const malformedDate = overviewFixture();
  malformedDate.auditTrail.items[0].createdAt = 'yesterday-ish';
  assert.equal(parseReferralMarketingOverview(malformedDate), null);
  const malformedActor = overviewFixture();
  malformedActor.auditTrail.items[0].actorUid = 17;
  assert.equal(parseReferralMarketingOverview(malformedActor), null);
  const tooManyAuditEntries = overviewFixture();
  tooManyAuditEntries.auditTrail = page(Array.from({ length: 51 }, (_, index) => ({
    id: `audit-${index}`, action: 'REFERRAL_REWARD_APPROVED',
  })));
  assert.equal(parseReferralMarketingOverview(tooManyAuditEntries), null);
});

test('builds a cursor request for exactly the requested collection and active audit filter', () => {
  const { overviewPageRequest } = loadDashboard();
  assert.deepEqual(
    overviewPageRequest('programs', 'program-cursor', { code: 'ABC-123' }),
    { programLimit: 10, pendingLimit: 10, flaggedLimit: 10, auditLimit: 20, code: 'ABC-123', programPageToken: 'program-cursor' },
  );
  assert.deepEqual(
    overviewPageRequest('auditTrail', 'audit-cursor', { action: 'REFERRAL_REWARD_APPROVED' }),
    { programLimit: 10, pendingLimit: 10, flaggedLimit: 10, auditLimit: 20, action: 'REFERRAL_REWARD_APPROVED', auditPageToken: 'audit-cursor' },
  );
  assert.throws(() => overviewPageRequest('topReferrers', 'cursor', {}), /not pageable/i);
});

test('appends a valid cursor page without replacing summaries or other loaded pages', () => {
  const { mergeOverviewPage } = loadDashboard();
  const current = overviewFixture();
  const incoming = overviewFixture();
  incoming.programs = page([{
    id: 'program-2', status: 'paused', countryCodes: ['FR'], currency: 'EUR',
    inviterCreditMinor: 700, invitedDiscountMinor: 200,
    startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.999Z',
  }]);
  incoming.pendingRewards = page([]);
  const merged = mergeOverviewPage(current, incoming, 'programs');
  assert.deepEqual(merged.programs.items.map(item => item.id), ['program-1', 'program-2']);
  assert.equal(merged.programs.truncated, false);
  assert.equal(merged.pendingRewards.items[0].id, 'reward-1');
  assert.equal(merged.funnel.codes, 20);
  const duplicate = overviewFixture();
  duplicate.programs = page([structuredClone(current.programs.items[0])]);
  assert.equal(mergeOverviewPage(current, duplicate, 'programs'), null);
});

test('promotes a migration-required response received during pagination instead of merging placeholders', () => {
  const { mergeOverviewPage } = loadDashboard();
  const merged = mergeOverviewPage(overviewFixture(), migrationFixture(), 'auditTrail');
  assert.equal(merged.state, 'migrationRequired');
  assert.equal(merged.auditTrail.items.length, 0);
});

test('parses only the exact server-authorized initializer result', () => {
  const { parseReferralMarketingInitializerResult } = loadDashboard();
  assert.deepEqual(parseReferralMarketingInitializerResult({ initialized: true, alreadyInitialized: false }), {
    initialized: true, alreadyInitialized: false,
  });
  assert.deepEqual(parseReferralMarketingInitializerResult({ initialized: true, alreadyInitialized: true }), {
    initialized: true, alreadyInitialized: true,
  });
  assert.equal(parseReferralMarketingInitializerResult({ initialized: false, alreadyInitialized: false }), null);
  assert.equal(parseReferralMarketingInitializerResult({ initialized: true }), null);
  assert.equal(parseReferralMarketingInitializerResult({ initialized: true, alreadyInitialized: false, seeded: true }), null);
});

test('invalidates stale overview and cursor work while allowing independent page requests', () => {
  const { createReferralDashboardRequestCoordinator } = loadDashboard();
  const coordinator = createReferralDashboardRequestCoordinator();
  const refresh = coordinator.begin('overview', true);
  const pending = coordinator.begin('pendingRewards');
  const audit = coordinator.begin('auditTrail');
  assert.equal(refresh(), true);
  assert.equal(pending(), true);
  assert.equal(audit(), true);
  const replacementPending = coordinator.begin('pendingRewards');
  assert.equal(pending(), false);
  assert.equal(replacementPending(), true);
  assert.equal(audit(), true);
  const initializer = coordinator.begin('initializer', true);
  assert.equal(refresh(), false);
  assert.equal(replacementPending(), false);
  assert.equal(audit(), false);
  assert.equal(initializer(), true);
  coordinator.cancel();
  assert.equal(initializer(), false);
  assert.equal(coordinator.begin('overview', true)(), false);
});

test('refresh supersession releases the initializer lock and stale completion cannot lock a retry', () => {
  const {
    createReferralDashboardRequestCoordinator,
    createSupersedableOperationLock,
  } = loadDashboard();
  const coordinator = createReferralDashboardRequestCoordinator();
  const lock = createSupersedableOperationLock();
  const firstRequest = coordinator.begin('initializer', true);
  const firstOperation = lock.begin();

  assert.notEqual(firstOperation, null);
  assert.equal(lock.isLocked(), true);
  coordinator.begin('overview', true);
  lock.supersede();
  assert.equal(firstRequest(), false);
  assert.equal(lock.isLocked(), false);

  const retryOperation = lock.begin();
  assert.notEqual(retryOperation, null);
  assert.equal(lock.release(firstOperation), false);
  assert.equal(lock.isLocked(), true);
  assert.equal(lock.release(retryOperation), true);
  assert.equal(lock.isLocked(), false);
});

test('refresh clears a later-page program identity before building a create payload', () => {
  const {
    mergeOverviewPage,
    reconcileSelectedProgramId,
    programMutationIdentityFields,
  } = loadDashboard();
  const firstPage = overviewFixture();
  const laterPage = overviewFixture();
  laterPage.programs = page([{
    id: 'program-2', status: 'paused', countryCodes: ['FR'], currency: 'EUR',
    inviterCreditMinor: 700, invitedDiscountMinor: 200,
    startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.999Z',
  }]);
  const loaded = mergeOverviewPage(firstPage, laterPage, 'programs');
  let selectedProgramId = reconcileSelectedProgramId('program-2', loaded.programs.items);
  assert.deepEqual(programMutationIdentityFields(selectedProgramId, loaded.programs.items), { programId: 'program-2' });

  selectedProgramId = reconcileSelectedProgramId(selectedProgramId, firstPage.programs.items);
  assert.equal(selectedProgramId, '');
  assert.deepEqual(programMutationIdentityFields(selectedProgramId, firstPage.programs.items), {});
});

test('keeps money and date formatting safe even when called defensively with bad data', () => {
  const { formatMoney, formatDate } = loadDashboard();
  assert.equal(formatMoney({ currency: 'EURO', amountMinor: 100 }), 'Montant indisponible');
  assert.equal(formatDate('not-a-date'), 'Date indisponible');
});

test('returns localized actionable errors for missing and oversized action reasons', () => {
  const { validateActionReason } = loadDashboard();
  assert.match(validateActionReason('reject', ''), /motif.*requis/i);
  assert.match(validateActionReason('flag', 'x'.repeat(501)), /500 caractères/i);
  assert.equal(validateActionReason('approve', ''), null);
  assert.equal(validateActionReason('clear', 'Contrôle terminé'), null);
});

test('keeps reward A locked while reward B starts and settles independently', () => {
  const { createRewardActionTracker } = loadDashboard();
  const tracker = createRewardActionTracker();
  assert.equal(tracker.begin('reward-a'), true);
  assert.equal(tracker.begin('reward-b'), true);
  assert.equal(tracker.has('reward-a'), true);
  assert.equal(tracker.begin('reward-a'), false);
  tracker.end('reward-b');
  assert.equal(tracker.has('reward-a'), true);
  assert.deepEqual(tracker.snapshot(), ['reward-a']);
  tracker.end('reward-a');
  assert.equal(tracker.has('reward-a'), false);
});
