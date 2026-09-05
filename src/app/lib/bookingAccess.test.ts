import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingListenerScope } from './bookingAccess';

test('booking listeners use server-provable client and assigned-barber scope', () => {
  assert.deepEqual(
    bookingListenerScope({ role: 'client', uid: 'client-a' }),
    { kind: 'client', field: 'clientId', value: 'client-a' },
  );
  assert.deepEqual(
    bookingListenerScope({ role: 'barber', uid: 'worker-a', barberId: 'barber-a' }),
    { kind: 'barber', field: 'barberId', value: 'barber-a' },
  );
  assert.deepEqual(
    bookingListenerScope({ role: 'admin', uid: 'admin-a' }),
    { kind: 'tenant' },
  );
});

test('anonymous and unassigned worker sessions attach no booking listener', () => {
  assert.deepEqual(bookingListenerScope(null), { kind: 'none' });
  assert.deepEqual(
    bookingListenerScope({ role: 'barber', uid: 'worker-a' }),
    { kind: 'none' },
  );
});
