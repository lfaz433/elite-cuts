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
  const { rewardBadge } = loadDashboard();

  assert.equal(rewardBadge('pending'), 'À examiner');
});
