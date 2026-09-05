const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => request.startsWith('.')
      ? require(resolve(dirname(filename), request))
      : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

test('payment command uses intent fields rather than writable booking field names', () => {
  const { parseBookingPaymentInput } = loadTypeScriptModule(
    'functions/src/bookingPayment.ts',
  );

  expect(parseBookingPaymentInput({
    amountMinor: 3000,
    tipMinor: 500,
    method: 'cash',
    evidence: { type: 'staff_cash_attestation' },
  })).toEqual({
    amountMinor: 3000,
    tipMinor: 500,
    method: 'cash',
    evidence: { type: 'staff_cash_attestation' },
  });
  expect(() => parseBookingPaymentInput({
    amountMinor: 3000,
    method: 'cash',
    paymentStatus: 'paid',
  })).toThrow('Server-owned payment fields cannot be supplied');
});

test.each([
  [{ amountMinor: 3000.5, tipMinor: 0, method: 'cash', evidence: { type: 'staff_cash_attestation' } }, 'amountMinor'],
  [{ amountMinor: 3000, tipMinor: 0.5, method: 'cash', evidence: { type: 'staff_cash_attestation' } }, 'tipMinor'],
  [{ amountMinor: 3000, tipMinor: 0, method: 'card', evidence: { type: 'staff_cash_attestation' } }, 'Card payments require verified processor evidence'],
])('rejects non-integral or unsupported payment evidence %#', (payment, message) => {
  const { parseBookingPaymentInput } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  expect(() => parseBookingPaymentInput(payment)).toThrow(message);
});

test('authorized payment recording updates the booking and appends an audit event', async () => {
  const { recordBookingPayment } = loadTypeScriptModule(
    'functions/src/bookingPayment.ts',
  );
  const state = {
    bookings: {
      'booking-a': {
        tenantId: 'tenant-a',
        locationId: 'tenant-a',
        status: 'completed',
        paymentStatus: 'unpaid',
        expectedAmountMinor: 4000,
        pricePaid: 0,
        tip: 0,
      },
    },
    memberships: {
      'membership-a': {
        userId: 'manager-a',
        brandId: 'tenant-a',
        locationId: 'tenant-a',
        status: 'active',
        permissions: { manageBookings: true },
      },
    },
    audit_logs: {},
  };
  const firestore = {
    collection: name => ({
      doc: id => ({ collectionName: name, id: id ?? 'audit-a' }),
    }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName][ref.id]),
        data: () => state[ref.collectionName][ref.id],
      })),
      update: (ref, value) => {
        state[ref.collectionName][ref.id] = {
          ...state[ref.collectionName][ref.id],
          ...value,
        };
      },
      create: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
    }),
  };
  const membership = { id: 'membership-a', ...state.memberships['membership-a'], role: 'admin' };

  await recordBookingPayment(
    'manager-a',
    'booking-a',
    'tenant-a',
    membership,
    {
      amountMinor: 4000,
      tipMinor: 500,
      method: 'cash',
      evidence: { type: 'staff_cash_attestation' },
    },
    firestore,
  );

  expect(state.bookings['booking-a']).toMatchObject({
    paymentStatus: 'paid',
    pricePaid: 40,
    tip: 5,
    pricePaidMinor: 4000,
    tipMinor: 500,
    paymentMethod: 'cash',
    paymentRecordedBy: 'manager-a',
  });
  expect(state.audit_logs['audit-a']).toMatchObject({
    action: 'BOOKING_PAYMENT_RECORDED',
    actorUid: 'manager-a',
    tenantId: 'tenant-a',
    bookingId: 'booking-a',
  });
});

test.each([
  [{ status: 'approved', paymentStatus: 'unpaid', expectedAmountMinor: 4000 }, 'Booking is not completed'],
  [{ status: 'completed', paymentStatus: 'paid', expectedAmountMinor: 4000 }, 'Booking payment is already recorded'],
  [{ status: 'completed', paymentStatus: 'unpaid', expectedAmountMinor: 5000 }, 'Payment amount does not match booking amount'],
])('rejects payment when booking state is not payable %#', async (bookingState, message) => {
  const { recordBookingPayment } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  const membership = {
    id: 'membership-a', userId: 'manager-a', brandId: 'tenant-a', locationId: 'tenant-a',
    status: 'active', role: 'admin', permissions: { manageBookings: true },
  };
  const state = { bookings: { 'booking-a': { tenantId: 'tenant-a', locationId: 'tenant-a', ...bookingState } }, memberships: { 'membership-a': membership }, audit_logs: {} };
  const firestore = {
    collection: name => ({ doc: id => ({ collectionName: name, id: id ?? 'audit-a' }) }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({ exists: Boolean(state[ref.collectionName][ref.id]), data: () => state[ref.collectionName][ref.id] })),
      update: () => {}, create: () => {},
    }),
  };

  await expect(recordBookingPayment('manager-a', 'booking-a', 'tenant-a', membership, {
    amountMinor: 4000, tipMinor: 0, method: 'cash', evidence: { type: 'staff_cash_attestation' },
  }, firestore)).rejects.toThrow(message);
});
