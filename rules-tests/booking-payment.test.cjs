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

test('completion and cash payment commit together with one audit event', async () => {
  const { completeBookingAndRecordPayment } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  const membership = {
    id: 'membership-a', userId: 'manager-a', brandId: 'tenant-a', locationId: 'tenant-a',
    status: 'active', role: 'admin', permissions: { manageBookings: true },
  };
  const state = {
    bookings: { 'booking-a': { tenantId: 'tenant-a', locationId: 'tenant-a', barberId: 'barber-a', date: '2026-09-05', time: '10:00', status: 'approved', paymentStatus: 'unpaid', expectedAmountMinor: 4000, isTest: false } },
    memberships: { 'membership-a': membership },
    audit_logs: {},
    notifications: {},
  };
  const firestore = {
    collection: name => ({ doc: id => ({
      collectionName: name,
      id: id ?? (name === 'notifications' ? 'notification-a' : 'audit-a'),
    }) }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({ exists: Boolean(state[ref.collectionName][ref.id]), data: () => state[ref.collectionName][ref.id] })),
      update: (ref, value) => { state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value }; },
      create: (ref, value) => { state[ref.collectionName][ref.id] = value; },
    }),
  };

  const result = await completeBookingAndRecordPayment('manager-a', 'booking-a', 'tenant-a', membership, {
    amountMinor: 4000, tipMinor: 500, method: 'cash', evidence: { type: 'staff_cash_attestation' },
  }, firestore, {
    sourceAlias: 'barber-a',
    userId: 'worker-a',
    membershipId: 'membership-worker-a',
  });

  expect(state.bookings['booking-a']).toMatchObject({
    status: 'completed', paymentStatus: 'paid', pricePaidMinor: 4000, tipMinor: 500, isTest: false,
  });
  expect(state.audit_logs['audit-a']).toMatchObject({
    action: 'BOOKING_COMPLETED_AND_PAID', actorUid: 'manager-a', bookingId: 'booking-a',
  });
  expect(state.notifications['notification-a']).toMatchObject({
    type: 'COMPLETED',
    serverIssued: true,
    tenantId: 'tenant-a',
    locationId: 'tenant-a',
    recipientId: 'worker-a',
    recipientMembershipId: 'membership-worker-a',
    reservationId: 'booking-a',
  });
  expect(result).toEqual({ notificationIds: ['notification-a'] });
});

function paymentFirestore(state) {
  return {
    collection: name => ({ doc: id => ({
      collectionName: name,
      id: id ?? (name === 'notifications' ? 'notification-a' : 'audit-a'),
    }) }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName]?.[ref.id]),
        data: () => state[ref.collectionName]?.[ref.id],
      })),
      update: (ref, value) => {
        state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
      },
      create: (ref, value) => { state[ref.collectionName][ref.id] = value; },
    }),
  };
}

test('marketplace staff can complete a booking when brand and location ids differ', async () => {
  const { completeBookingAndRecordPayment } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  const membership = {
    id: 'brand-b__location-l__manager-a', userId: 'manager-a', brandId: 'brand-b',
    locationId: 'location-l', status: 'active', role: 'salon_admin',
    permissions: { manageBookings: true },
  };
  const state = {
    bookings: { 'booking-a': {
      tenantId: 'location-l', locationId: 'location-l', brandId: 'brand-b',
      serviceId: 'service-a', status: 'approved', paymentStatus: 'unpaid', expectedAmountMinor: 4000,
    } },
    memberships: { [membership.id]: membership }, services: {}, audit_logs: {}, notifications: {},
  };

  await completeBookingAndRecordPayment('manager-a', 'booking-a', 'location-l', membership, {
    amountMinor: 4000, tipMinor: 0, method: 'cash', evidence: { type: 'staff_cash_attestation' },
  }, paymentFirestore(state));

  expect(state.bookings['booking-a']).toMatchObject({ status: 'completed', paymentStatus: 'paid' });
  expect(state.bookings['booking-a']).not.toHaveProperty('isTest');
});

test('legacy booking amount is atomically resolved from its location-scoped service', async () => {
  const { completeBookingAndRecordPayment } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  const membership = {
    id: 'membership-a', userId: 'manager-a', brandId: 'tenant-a', locationId: 'tenant-a',
    status: 'active', role: 'admin', permissions: { manageBookings: true },
  };
  const state = {
    bookings: { 'booking-a': {
      tenantId: 'tenant-a', locationId: 'tenant-a', serviceId: 'service-a',
      status: 'approved', paymentStatus: 'unpaid',
    } },
    memberships: { 'membership-a': membership },
    services: { 'service-a': { tenantId: 'tenant-a', price: '40 €' } },
    audit_logs: {}, notifications: {},
  };

  await completeBookingAndRecordPayment('manager-a', 'booking-a', 'tenant-a', membership, {
    amountMinor: 4000, tipMinor: 0, method: 'cash', evidence: { type: 'staff_cash_attestation' },
  }, paymentFirestore(state));

  expect(state.bookings['booking-a']).toMatchObject({
    status: 'completed', paymentStatus: 'paid', expectedAmountMinor: 4000,
  });
});

test('legacy booking resolution still rejects a payment that mismatches the trusted service price', async () => {
  const { completeBookingAndRecordPayment } = loadTypeScriptModule('functions/src/bookingPayment.ts');
  const membership = {
    id: 'membership-a', userId: 'manager-a', brandId: 'tenant-a', locationId: 'tenant-a',
    status: 'active', role: 'admin', permissions: { manageBookings: true },
  };
  const state = {
    bookings: { 'booking-a': {
      tenantId: 'tenant-a', locationId: 'tenant-a', serviceId: 'service-a',
      status: 'approved', paymentStatus: 'unpaid',
    } },
    memberships: { 'membership-a': membership },
    services: { 'service-a': { tenantId: 'tenant-a', price: '50' } },
    audit_logs: {}, notifications: {},
  };

  await expect(completeBookingAndRecordPayment(
    'manager-a', 'booking-a', 'tenant-a', membership,
    { amountMinor: 4000, tipMinor: 0, method: 'cash', evidence: { type: 'staff_cash_attestation' } },
    paymentFirestore(state),
  )).rejects.toThrow('Payment amount does not match booking amount');
});
