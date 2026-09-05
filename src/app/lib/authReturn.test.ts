import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  captureInvitationReturn,
  loginPathForProtectedRoute,
  postLoginDestination,
} from './authReturn';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

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

test('preserves the authenticated booking handoff route through login', () => {
  assert.equal(
    loginPathForProtectedRoute('/book'),
    '/?login=true&returnTo=%2Fbook',
  );
  assert.equal(
    postLoginDestination('?returnTo=%2Fbook', '/client'),
    '/book',
  );
});

test('recovers a safe invitation destination after the login query is cleared', () => {
  const storage = new MemoryStorage();
  captureInvitationReturn('?login=true&returnTo=%2Finvitations%2Finvite-worker', storage);

  assert.equal(postLoginDestination('', '/client', storage), '/invitations/invite-worker');
  assert.equal(postLoginDestination('', '/client', storage), '/client');
});

test('never persists an external login destination', () => {
  const storage = new MemoryStorage();
  captureInvitationReturn('?returnTo=https%3A%2F%2Fevil.example', storage);

  assert.equal(postLoginDestination('', '/client', storage), '/client');
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
