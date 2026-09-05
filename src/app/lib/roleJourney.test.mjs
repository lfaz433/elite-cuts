import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoleJourney } from './roleJourney.mjs';

test('sends salon brands to the live salon registration flow', () => {
  assert.deepEqual(getRoleJourney('brand'), {
    kind: 'navigate',
    path: '/register',
  });
});

test('sends invited salon staff to sign in before accepting their invitation', () => {
  assert.deepEqual(getRoleJourney('invitation'), {
    kind: 'login',
  });
});

test('keeps unfinished marketplace journeys visibly unavailable', () => {
  assert.deepEqual(getRoleJourney('freelancer'), {
    kind: 'coming-soon',
    label: 'Freelance barber profiles are launching soon.',
  });
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
