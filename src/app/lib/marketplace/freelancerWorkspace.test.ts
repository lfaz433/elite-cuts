import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmedAddressBookingIds,
  freelancerOwnerScope,
  jobBoardLoadKey,
} from './freelancerWorkspace';

test('owner queries constrain both the authenticated owner and freelancer record type', () => {
  assert.deepEqual(freelancerOwnerScope('freelancer-a'), [
    ['ownerId', '==', 'freelancer-a'],
    ['ownerType', '==', 'freelancer'],
  ]);
});

test('requests exact addresses only for confirmed freelancer bookings without a cached address', () => {
  const bookings = [
    { id: 'pending', ownerType: 'freelancer', status: 'pending_approval' },
    { id: 'confirmed', ownerType: 'freelancer', status: 'confirmed' },
    { id: 'salon', ownerType: 'salon', status: 'confirmed' },
    { id: 'cached', ownerType: 'freelancer', status: 'confirmed' },
  ];

  assert.deepEqual(confirmedAddressBookingIds(bookings, new Set(['cached'])), ['confirmed']);
});

test('a successful first profile save changes the job board load key in the same city', () => {
  assert.notEqual(jobBoardLoadKey('fr-paris', 0), jobBoardLoadKey('fr-paris', 1));
});
