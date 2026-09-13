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

function overviewFixture() {
  const pendingReward = {
    id: 'reward-1', programId: 'program-1', bookingId: 'booking-1', inviterId: 'inviter-1',
    invitedUserId: 'invitee-1', inviterCreditMinor: 500, invitedDiscountMinor: 300,
    currency: 'EUR', status: 'pending', createdAt: '2026-09-10T08:30:00.000Z',
    fraudFlag: { status: 'flagged', reason: 'Identités concordantes' },
  };
  return {
    contractVersion: 2,
    programs: [{
      id: 'program-1', status: 'active', countryCodes: ['FR', 'BE'], currency: 'EUR',
      inviterCreditMinor: 500, invitedDiscountMinor: 300,
      startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.999Z',
    }],
    funnel: {
      codes: 20, validatedVisits: 15, attributions: 10, attributedSignups: 10,
      rewards: 8, eligibleFirstBookings: 8, pending: 3, pendingRewards: 3,
      approved: 4, approvedRewards: 4, rejected: 1,
    },
    approvedCreditTotals: [{ currency: 'EUR', amountMinor: 4_200 }, { currency: 'USD', amountMinor: 900 }],
    topReferrers: [{
      inviterId: 'same-id', inviterOwnerType: 'brand', referrals: 4, rewards: 3,
      approvedCreditTotals: [{ currency: 'EUR', amountMinor: 1_000 }],
    }],
    pendingRewards: [pendingReward],
    flaggedRewards: [pendingReward],
    auditTrail: [{
      id: 'audit-1', action: 'REFERRAL_REWARD_FLAGGED', programId: 'program-1', rewardId: 'reward-1',
      code: 'ABC-123', actorUid: 'admin-1', reason: 'Identités concordantes',
      createdAt: '2026-09-10T08:35:00.000Z',
    }],
  };
}

function detachFlaggedReward(fixture) {
  fixture.flaggedRewards = [structuredClone(fixture.flaggedRewards[0])];
  return fixture;
}

test('calculates referral funnel conversion rates from real counts', () => {
  const { funnelRate } = loadDashboard();
  assert.equal(funnelRate(5, 20), 25);
  assert.equal(funnelRate(1, 0), 0);
});

test('reports the validated visit count without inferring telemetry availability', () => {
  const { telemetryText } = loadDashboard();
  assert.equal(telemetryText(0), '0 visite(s) validée(s)');
});

test('parses every nested value in the exact v2 overview contract', () => {
  const { parseReferralMarketingOverview, referrerKey } = loadDashboard();
  const overview = parseReferralMarketingOverview(overviewFixture());

  assert.equal(overview.contractVersion, 2);
  assert.deepEqual(overview.programs[0].countryCodes, ['FR', 'BE']);
  assert.equal(overview.funnel.approvedRewards, 4);
  assert.equal(overview.approvedCreditTotals[1].currency, 'USD');
  assert.equal(referrerKey(overview.topReferrers[0]), 'brand:same-id');
  assert.equal(overview.pendingRewards[0].fraudFlag.reason, 'Identités concordantes');
  assert.equal(overview.flaggedRewards[0].fraudFlag.status, 'flagged');
  assert.equal(overview.auditTrail[0].actorUid, 'admin-1');
});

test('rejects an incompatible contract version', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  assert.equal(parseReferralMarketingOverview({ ...overviewFixture(), contractVersion: 1 }), null);
});

test('rejects malformed currencies and unsafe numeric values', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const malformedCurrency = overviewFixture();
  malformedCurrency.approvedCreditTotals[0].currency = 'EURO';
  assert.equal(parseReferralMarketingOverview(malformedCurrency), null);

  const malformedAmount = overviewFixture();
  malformedAmount.pendingRewards[0].inviterCreditMinor = Number.NaN;
  assert.equal(parseReferralMarketingOverview(malformedAmount), null);
});

test('rejects malformed nested fraud flags rather than exposing them to rendering', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const malformed = overviewFixture();
  malformed.pendingRewards[0].fraudFlag = { status: 'flagged', reason: 42 };
  assert.equal(parseReferralMarketingOverview(malformed), null);

  const missingFlag = overviewFixture();
  missingFlag.flaggedRewards[0].fraudFlag = { status: 'cleared', reason: 'Déjà traité' };
  assert.equal(parseReferralMarketingOverview(missingFlag), null);
});

test('rejects inconsistent pending and flagged reward collections', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const missingFlaggedEntry = overviewFixture();
  missingFlaggedEntry.flaggedRewards = [];
  assert.equal(parseReferralMarketingOverview(missingFlaggedEntry), null);

  const unknownFlaggedEntry = overviewFixture();
  unknownFlaggedEntry.pendingRewards = [];
  assert.equal(parseReferralMarketingOverview(unknownFlaggedEntry), null);
});

test('rejects blank, untrimmed, and oversized fraud flag reasons', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const reason of ['   ', ' motif avec espaces ', 'x'.repeat(501)]) {
    const malformed = overviewFixture();
    malformed.pendingRewards[0].fraudFlag.reason = reason;
    assert.equal(parseReferralMarketingOverview(malformed), null, `accepted invalid flag reason: ${reason.length}`);
  }
});

test('rejects a flagged row whose identity or program references differ from pending', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const [label, mutate] of [
    ['inviter', reward => { reward.inviterId = 'another-inviter'; }],
    ['invitee', reward => { reward.invitedUserId = 'another-invitee'; }],
    ['program', reward => { reward.programId = 'another-program'; }],
    ['booking', reward => { reward.bookingId = 'another-booking'; }],
  ]) {
    const malformed = detachFlaggedReward(overviewFixture());
    mutate(malformed.flaggedRewards[0]);
    assert.equal(parseReferralMarketingOverview(malformed), null, `accepted mismatched ${label}`);
  }
});

test('rejects a flagged row whose amount, currency, date, or reason differs from pending', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  for (const [label, mutate] of [
    ['inviter amount', reward => { reward.inviterCreditMinor = 700; }],
    ['invitee amount', reward => { reward.invitedDiscountMinor = 100; }],
    ['currency', reward => { reward.currency = 'USD'; }],
    ['date', reward => { reward.createdAt = '2026-09-11T08:30:00.000Z'; }],
    ['reason', reward => { reward.fraudFlag.reason = 'Autre motif'; }],
  ]) {
    const malformed = detachFlaggedReward(overviewFixture());
    mutate(malformed.flaggedRewards[0]);
    assert.equal(parseReferralMarketingOverview(malformed), null, `accepted mismatched ${label}`);
  }
});

test('rejects malformed optional audit data, dates, and oversized audit results', () => {
  const { parseReferralMarketingOverview } = loadDashboard();
  const malformedDate = overviewFixture();
  malformedDate.auditTrail[0].createdAt = 'yesterday-ish';
  assert.equal(parseReferralMarketingOverview(malformedDate), null);

  const malformedActor = overviewFixture();
  malformedActor.auditTrail[0].actorUid = 17;
  assert.equal(parseReferralMarketingOverview(malformedActor), null);

  const oversizedReason = overviewFixture();
  oversizedReason.auditTrail[0].reason = 'x'.repeat(501);
  assert.equal(parseReferralMarketingOverview(oversizedReason), null);

  const tooManyAuditEntries = overviewFixture();
  tooManyAuditEntries.auditTrail = Array.from({ length: 51 }, (_, index) => ({
    id: `audit-${index}`, action: 'REFERRAL_REWARD_APPROVED',
  }));
  assert.equal(parseReferralMarketingOverview(tooManyAuditEntries), null);
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

test('invalidates stale overview work when a newer request begins or the component cancels', () => {
  const { createLatestRequestCoordinator } = loadDashboard();
  const coordinator = createLatestRequestCoordinator();
  const first = coordinator.begin();
  const second = coordinator.begin();

  assert.equal(first(), false);
  assert.equal(second(), true);
  coordinator.cancel();
  assert.equal(second(), false);
  const lateRequest = coordinator.begin();
  assert.equal(lateRequest(), false);
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
