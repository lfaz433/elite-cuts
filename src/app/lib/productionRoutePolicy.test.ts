import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyProductionRedirect } from './productionRoutePolicy.ts';

test('freelancer preview leads to the authenticated real workspace', () => {
  assert.equal(legacyProductionRedirect('freelancer-preview'), '/freelancer');
});

test('non-freelancer and obsolete booking previews lead to the public home', () => {
  assert.equal(legacyProductionRedirect('client-preview'), '/');
  assert.equal(legacyProductionRedirect('brand-preview'), '/');
  assert.equal(legacyProductionRedirect('landing-v2-preview'), '/');
  assert.equal(legacyProductionRedirect('book'), '/');
});
