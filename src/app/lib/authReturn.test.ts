import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  loginPathForProtectedRoute,
  postLoginDestination,
} from './authReturn';

test('preserves an invitation destination through the login URL', () => {
  assert.equal(
    loginPathForProtectedRoute('/invitations/invite-worker'),
    '/?login=true&returnTo=%2Finvitations%2Finvite-worker',
  );
  assert.equal(
    postLoginDestination('?login=true&returnTo=%2Finvitations%2Finvite-worker', '/client'),
    '/invitations/invite-worker',
  );
});

test('rejects external and non-invitation login return destinations', () => {
  assert.equal(
    postLoginDestination('?returnTo=https%3A%2F%2Fevil.example', '/client'),
    '/client',
  );
  assert.equal(
    postLoginDestination('?returnTo=%2Fsuperadmin', '/client'),
    '/client',
  );
});
