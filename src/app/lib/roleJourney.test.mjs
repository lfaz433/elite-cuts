import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoleJourney } from './roleJourney.mjs';

test('sends salon brands to the live salon registration flow', () => {
  assert.deepEqual(getRoleJourney('brand'), {
    kind: 'navigate',
    path: '/register?mode=brand',
  });
});

test('sends invited salon staff to sign in before accepting their invitation', () => {
  assert.deepEqual(getRoleJourney('invitation'), {
    kind: 'login',
  });
});

test('starts freelancer account creation and returns to the live workspace', () => {
  assert.deepEqual(getRoleJourney('freelancer'), {
    kind: 'navigate',
    path: '/?login=true&returnTo=%2Ffreelancer&signup=freelancer',
  });
});

test('keeps only unfinished journeys unavailable', () => {
  assert.deepEqual(getRoleJourney('client'), {
    kind: 'coming-soon',
    label: 'Nearby barber discovery is launching soon.',
  });
});

test('localizes the unavailable journey message', () => {
  assert.deepEqual(getRoleJourney('client', 'fr'), {
    kind: 'coming-soon',
    label: 'La découverte des barbiers proches arrive bientôt.',
  });
});
