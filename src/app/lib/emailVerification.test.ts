import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  refreshVerifiedEmail,
  sendAccountVerification,
} from './emailVerification';

test('new account verification sends through the supplied Firebase operation', async () => {
  const user = { uid: 'new-user' };
  const calls: unknown[] = [];

  await sendAccountVerification(user, async candidate => {
    calls.push(candidate);
  });

  assert.deepEqual(calls, [user]);
});

test('verification recovery reloads the user and force-refreshes the token', async () => {
  const calls: string[] = [];
  const user = {
    emailVerified: false,
    getIdToken: async (forceRefresh?: boolean) => {
      calls.push(`token:${String(forceRefresh)}`);
      return 'token';
    },
  };

  const verified = await refreshVerifiedEmail(user, async candidate => {
    calls.push('reload');
    candidate.emailVerified = true;
  });

  assert.equal(verified, true);
  assert.deepEqual(calls, ['reload', 'token:true']);
});

test('verification recovery does not refresh a token while email remains unverified', async () => {
  const calls: string[] = [];
  const user = {
    emailVerified: false,
    getIdToken: async () => {
      calls.push('token');
      return 'token';
    },
  };

  const verified = await refreshVerifiedEmail(user, async () => {
    calls.push('reload');
  });

  assert.equal(verified, false);
  assert.deepEqual(calls, ['reload']);
});
