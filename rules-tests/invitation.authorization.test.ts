import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import invitationAuthorization from '../functions/src/invitations';

const {
  assertInvitationRecipient,
  assertInvitationSender,
  membershipRelationshipForInvitation,
  safeWorkerPublicProfile,
} = invitationAuthorization;

test('accepted worker profile contains only safe public primitives', () => {
  const profile = safeWorkerPublicProfile({
    brandId: 'brand-france',
    locationId: 'paris',
    email: 'worker@example.com',
    displayName: 'Worker',
    role: 'worker',
    permissions: {},
    status: 'pending',
    invitedBy: 'admin-a',
  }, 'worker-a');

  assert.deepEqual(profile, {
    name: 'Worker', email: 'worker@example.com', userId: 'worker-a', uid: 'worker-a',
    brandId: 'brand-france', locationId: 'paris', tenantId: 'paris',
    publicCredentialSafe: true,
  });
});

test('rejects a location membership without inviteWorkers permission', () => {
  assert.throws(() => assertInvitationSender({
    userId: 'salon-admin',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'salon_admin',
    status: 'active',
    permissions: { inviteWorkers: false },
  }, 'salon-admin', 'brand-france', 'paris', 'worker'), (error: { code?: string }) => (
    error.code === 'permission-denied'
  ));
});

test('a delegated Salon Admin cannot invite another Salon Admin', () => {
  assert.throws(() => assertInvitationSender({
    userId: 'salon-admin',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'salon_admin',
    status: 'active',
    permissions: { inviteWorkers: true },
  }, 'salon-admin', 'brand-france', 'paris', 'salon_admin'), (error: { code?: string }) => (
    error.code === 'permission-denied'
  ));
});

test('a location Principal Admin may invite a Salon Admin', () => {
  assert.doesNotThrow(() => assertInvitationSender({
    userId: 'principal-admin',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'principal_admin',
    status: 'active',
    permissions: { inviteWorkers: true },
  }, 'principal-admin', 'brand-france', 'paris', 'salon_admin'));
});

test('rejects invitation acceptance by a different email account', () => {
  assert.throws(() => assertInvitationRecipient({
    email: 'worker@example.com',
  }, {
    uid: 'different-account',
    email: 'different@example.com',
    emailVerified: true,
  }), (error: { code?: string }) => error.code === 'permission-denied');
});

test('rejects invitation acceptance by an unverified matching email account', () => {
  assert.throws(() => assertInvitationRecipient({
    email: 'worker@example.com',
  }, {
    uid: 'worker-account',
    email: 'worker@example.com',
    emailVerified: false,
  }), (error: { code?: string }) => error.code === 'permission-denied');
});

test('keeps an accepted chair rental independent from an employee membership', () => {
  assert.deepEqual(membershipRelationshipForInvitation({
    role: 'chair_renter',
    relationshipType: 'chair_rental',
  }), {
    role: 'chair_renter',
    relationshipType: 'chair_rental',
    createsWorkerProfile: false,
  });
  assert.deepEqual(membershipRelationshipForInvitation({
    role: 'worker',
    relationshipType: 'employee',
  }), {
    role: 'worker',
    relationshipType: 'employee',
    createsWorkerProfile: true,
  });
});

test('rejects a job invitation whose role contradicts its relationship type', () => {
  assert.throws(() => membershipRelationshipForInvitation({
    role: 'worker',
    relationshipType: 'chair_rental',
  }), (error: { code?: string }) => error.code === 'failed-precondition');
});
