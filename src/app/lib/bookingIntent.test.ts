import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { staffCreateActionForBooking } from './bookingIntent';

test('manual approved appointments remain unpaid until service completion', () => {
  assert.deepEqual(staffCreateActionForBooking({
    status: 'approved', paymentStatus: 'unpaid', pricePaid: 0, tip: 0, paymentMethod: 'cash',
  }), { status: 'approved' });
  assert.throws(() => staffCreateActionForBooking({
    status: 'approved', paymentStatus: 'paid', pricePaid: 40, tip: 0, paymentMethod: 'cash',
  }), /cannot be marked paid/i);
});

test('completed staff booking carries an atomic cash payment intent', () => {
  assert.deepEqual(staffCreateActionForBooking({
    status: 'completed', paymentStatus: 'paid', pricePaid: 40, tip: 5, paymentMethod: 'cash',
  }), {
    status: 'completed',
    payment: {
      amountMinor: 4000,
      tipMinor: 500,
      method: 'cash',
      evidence: { type: 'staff_cash_attestation' },
    },
  });
  assert.throws(() => staffCreateActionForBooking({
    status: 'completed', paymentStatus: 'paid', pricePaid: 40, tip: 0, paymentMethod: 'card',
  }), /Card payments require verified processor evidence/);
});
