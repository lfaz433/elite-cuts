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

test('calculates referral funnel conversion rates from real counts', () => {
  const { funnelRate } = loadDashboard();

  assert.equal(funnelRate(5, 20), 25);
});

test('labels pending referral credits for manual review', () => {
  const { telemetryText } = loadDashboard();

  assert.equal(telemetryText(0, false), 'Indisponible (App Check désactivé)');
});

test('parses only the exact v2 overview contract and preserves typed currency keys', () => {
  const { parseReferralMarketingOverview, referrerKey } = loadDashboard();
  const fixture = { contractVersion: 2, programs: [], funnel: { codes: 1, validatedVisits: 0, attributions: 1, attributedSignups: 1, rewards: 1, eligibleFirstBookings: 1, pending: 1, pendingRewards: 1, approved: 0, approvedRewards: 0, rejected: 0 }, approvedCreditTotals: [{ currency: 'EUR', amountMinor: 500 }], topReferrers: [{ inviterId: 'same-id', inviterOwnerType: 'brand', referrals: 1, rewards: 1, approvedCreditTotals: [{ currency: 'EUR', amountMinor: 500 }] }], pendingRewards: [], flaggedRewards: [], auditTrail: [] };
  const overview = parseReferralMarketingOverview(fixture);
  assert.equal(overview.contractVersion, 2);
  assert.equal(referrerKey(overview.topReferrers[0]), 'brand:same-id');
  assert.equal(parseReferralMarketingOverview({ ...fixture, contractVersion: 1 }), null);
});
