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

  expect(parseBookingPaymentInput({ amount: 30, tip: 5, method: 'cash' }))
    .toEqual({ amount: 30, tip: 5, method: 'cash' });
  expect(() => parseBookingPaymentInput({
    amount: 30,
    method: 'cash',
    paymentStatus: 'paid',
  })).toThrow('Server-owned payment fields cannot be supplied');
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
        status: 'approved',
        paymentStatus: 'unpaid',
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
    { amount: 40, tip: 5, method: 'cash' },
    firestore,
  );

  expect(state.bookings['booking-a']).toMatchObject({
    paymentStatus: 'paid',
    pricePaid: 40,
    tip: 5,
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
