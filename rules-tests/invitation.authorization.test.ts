import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import invitationAuthorization from '../functions/src/invitations';

const {
  assertInvitationRecipient,
  assertInvitationSender,
} = invitationAuthorization;

test('rejects a location membership without inviteWorkers permission', () => {
  assert.throws(() => assertInvitationSender({
    userId: 'salon-admin',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'salon_admin',
    status: 'active',
    permissions: { inviteWorkers: false },
  }, 'salon-admin', 'brand-france', 'paris'), (error: { code?: string }) => (
    error.code === 'permission-denied'
  ));
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
