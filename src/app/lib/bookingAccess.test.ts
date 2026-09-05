import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignedBarberRecordListenerScope,
  bookingListenerScope,
} from './bookingAccess';

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

test('attendance and settlement listeners constrain workers to their assigned barber', () => {
  assert.deepEqual(
    assignedBarberRecordListenerScope({
      role: 'barber',
      uid: 'worker-a',
      barberId: 'barber-a',
    }),
    { kind: 'barber', field: 'barberId', value: 'barber-a' },
  );
});

test('attendance and settlement listeners preserve tenant managers and skip unauthorized sessions', () => {
  assert.deepEqual(
    assignedBarberRecordListenerScope({ role: 'admin', uid: 'admin-a' }),
    { kind: 'tenant' },
  );
  assert.deepEqual(
    assignedBarberRecordListenerScope({ role: 'superadmin', uid: 'root-a' }),
    { kind: 'tenant' },
  );
  assert.deepEqual(
    assignedBarberRecordListenerScope({ role: 'client', uid: 'client-a' }),
    { kind: 'none' },
  );
  assert.deepEqual(
    assignedBarberRecordListenerScope({ role: 'barber', uid: 'worker-a' }),
    { kind: 'none' },
  );
  assert.deepEqual(assignedBarberRecordListenerScope(null), { kind: 'none' });
});
