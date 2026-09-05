const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = isAbsolute(relativePath)
    ? relativePath
    : resolve(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
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
      ? loadTypeScriptModule(resolve(dirname(filename), `${request}.ts`))
      : require(request),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const validBooking = {
  clientName: 'Test Client',
  clientEmail: 'client@example.test',
  clientPhone: '+213555000000',
  serviceId: 'service-a',
  barberId: 'barber-a',
  date: '2099-09-05',
  time: '10:30',
  type: 'avec-rdv',
};

test.each([
  'status',
  'tenantId',
  'locationId',
  'clientId',
  'createdAt',
  'paymentStatus',
  'pricePaid',
  'tip',
  'paymentMethod',
])(
  'server booking parser rejects client-owned %s',
  field => {
    const { parseBookingCreateInput } = loadTypeScriptModule(
      'functions/src/bookingCreate.ts',
    );

    expect(() => parseBookingCreateInput({ ...validBooking, [field]: 'forged' }))
      .toThrow('Server-owned booking fields cannot be supplied by the client');
  },
);

test('server booking parser accepts the public booking fields only', () => {
  const { parseBookingCreateInput } = loadTypeScriptModule(
    'functions/src/bookingCreate.ts',
  );

  expect(parseBookingCreateInput(validBooking)).toEqual(validBooking);
});

test('server booking creation persists unpaid zero-value financial defaults', async () => {
  const { createBooking } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const state = {
    tenants: { 'tenant-a': { name: 'Tenant A', settings: { allowOnlineBooking: true } } },
    services: { 'service-a': { tenantId: 'tenant-a', duration: '30 min', price: '40' } },
    barbers: { 'barber-a': { tenantId: 'tenant-a', workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00' } },
    businessInfo: { info: { timezone: 'UTC', weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } } },
    bookings: {},
    booking_slot_locks: {},
  };
  const firestore = {
    collection: name => ({
      doc: id => ({
        collectionName: name,
        id: id ?? 'booking-a',
        collection: child => ({ doc: childId => ({ collectionName: child, id: childId }) }),
      }),
      where() { return this; },
    }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName]?.[ref.id]),
        data: () => state[ref.collectionName]?.[ref.id],
      })),
      get: async () => ({ empty: true, docs: [] }),
      set: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
      create: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
    }),
  };

  await createBooking('tenant-a', 'client-a', validBooking, firestore);

  expect(state.bookings['booking-a']).toMatchObject({
    tenantId: 'tenant-a',
    locationId: 'tenant-a',
    status: 'pending',
    paymentStatus: 'unpaid',
    pricePaid: 0,
    tip: 0,
    expectedAmountMinor: 4000,
  });
  expect(state.bookings['booking-a']).not.toHaveProperty('paymentMethod');
});

test.each([
  ['automatic', 'approved'],
  ['manual', 'pending'],
  [undefined, 'pending'],
])('location booking policy %s produces %s client bookings', (bookingPolicy, expected) => {
  const { initialClientBookingStatus } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const tenant = bookingPolicy ? { settings: { bookingPolicy } } : { settings: {} };
  expect(initialClientBookingStatus(tenant)).toBe(expected);
});

test('location-owned public settings can select automatic booking policy', () => {
  const { initialClientBookingStatus } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  expect(initialClientBookingStatus(
    { settings: { bookingPolicy: 'manual' } },
    { bookingPolicy: 'automatic' },
  )).toBe('approved');
});

test('server booking creation requires an authenticated caller', async () => {
  const { createBooking } = loadTypeScriptModule('functions/src/bookingCreate.ts');

  await expect(createBooking('tenant-a', null, validBooking, {}))
    .rejects.toThrow('Authentication is required');
});

test('authorized walk-in creation atomically stores completed cash payment and audit', async () => {
  const { createBooking } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const state = {
    tenants: { 'location-l': { brandId: 'brand-b', name: 'Location L', settings: { allowOnlineBooking: true } } },
    services: { 'service-a': { tenantId: 'location-l', duration: '30 min', price: '40' } },
    barbers: { 'barber-a': { tenantId: 'location-l', workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00' } },
    businessInfo: { info: { timezone: 'UTC', weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } } },
    memberships: {
      'membership-a': {
        userId: 'barber-user', brandId: 'brand-b', locationId: 'location-l', status: 'active',
        permissions: { manageBookings: true },
      },
    },
    bookings: {},
    booking_slot_locks: {},
    audit_logs: {},
  };
  const firestore = {
    collection(name) {
      const filters = [];
      return {
        collectionName: name,
        filters,
        doc: id => ({
          collectionName: name,
          id: id ?? (name === 'bookings' ? 'booking-a' : 'audit-a'),
          collection: child => ({ doc: childId => ({ collectionName: child, id: childId }) }),
        }),
        where(field, _operator, value) { filters.push([field, value]); return this; },
        limit() { return this; },
        async get() {
          const docs = Object.entries(state[name] ?? {})
            .filter(([, value]) => filters.every(([field, expected]) => value[field] === expected))
            .map(([id, value]) => ({ id, data: () => value }));
          return { empty: docs.length === 0, docs };
        },
      };
    },
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName]?.[ref.id]),
        data: () => state[ref.collectionName]?.[ref.id],
      })),
      get: async () => ({ empty: true, docs: [] }),
      set: (ref, value) => { state[ref.collectionName][ref.id] = value; },
      create: (ref, value) => { state[ref.collectionName][ref.id] = value; },
    }),
  };

  const result = await createBooking(
    'location-l',
    'barber-user',
    { ...validBooking, type: 'sans-rdv' },
    firestore,
    {
      status: 'completed',
      payment: {
        amountMinor: 4000,
        tipMinor: 500,
        method: 'cash',
        evidence: { type: 'staff_cash_attestation' },
      },
    },
  );

  expect(result).toEqual({ bookingId: 'booking-a', status: 'completed' });
  expect(state.bookings['booking-a']).toMatchObject({
    brandId: 'brand-b', tenantId: 'location-l', locationId: 'location-l',
    status: 'completed', paymentStatus: 'paid', pricePaidMinor: 4000, tipMinor: 500,
    pricePaid: 40, tip: 5, paymentMethod: 'cash', paymentRecordedBy: 'barber-user',
  });
  expect(state.audit_logs['audit-a']).toMatchObject({
    action: 'WALK_IN_BOOKING_COMPLETED_AND_PAID', actorUid: 'barber-user',
    tenantId: 'location-l', bookingId: 'booking-a',
  });
});

test.each([
  [{ date: '2020-01-01' }, 'Booking must be in the future'],
  [{ time: '19:00' }, 'Booking is outside location hours'],
])('server rejects invalid appointment timing %#', async (override, message) => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const booking = { ...validBooking, ...override };
  const tenant = { settings: { allowOnlineBooking: true } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = { timezone: 'UTC', weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } };

  expect(() => validateBookingSlot(booking, tenant, service, barber, businessInfo, new Date('2099-09-05T09:00:00Z')))
    .toThrow(message);
});

test.each([
  [{ settings: { allowOnlineBooking: false } }, {}, 'Online booking is disabled'],
  [{ settings: { allowOnlineBooking: true } }, { archived: true }, 'Barber is unavailable'],
  [{ settings: { allowOnlineBooking: true } }, { mainServiceId: 'service-b' }, 'Barber does not provide this service'],
])('server enforces booking policy and barber availability %#', (tenant, barberOverride, message) => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00', ...barberOverride };
  const businessInfo = { timezone: 'UTC', weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } };

  expect(() => validateBookingSlot(validBooking, tenant, service, barber, businessInfo, new Date('2099-09-05T09:00:00Z')))
    .toThrow(message);
});

test('public caller cannot bypass future-date validation by claiming a walk-in', () => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const booking = { ...validBooking, type: 'sans-rdv', date: '2020-01-01', time: '10:30' };
  const tenant = { settings: { allowOnlineBooking: true } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [3], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = { timezone: 'UTC', weeklyHours: { wednesday: { isOpen: true, open: '09:00', close: '18:00' } } };

  expect(() => validateBookingSlot(booking, tenant, service, barber, businessInfo, new Date('2099-09-05T09:00:00Z'), false))
    .toThrow('Walk-in booking requires staff authorization');
});

test('server detects an overlapping active booking', () => {
  const { assertNoBookingOverlap } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  expect(() => assertNoBookingOverlap(validBooking, 30, [{
    barberId: 'barber-a', date: '2099-09-05', time: '10:45', durationMinutes: 30, status: 'approved',
  }])).toThrow('Booking slot is no longer available');
});

test('server interprets a Europe/Paris booking as local wall time at the lead-time boundary', () => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const booking = { ...validBooking, date: '2099-07-01', time: '10:30' };
  const tenant = { settings: { allowOnlineBooking: true, minBookingLeadMinutes: 30 } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [3], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = {
    timezone: 'Europe/Paris',
    weeklyHours: { wednesday: { isOpen: true, open: '09:00', close: '18:00' } },
  };

  expect(() => validateBookingSlot(
    booking,
    tenant,
    service,
    barber,
    businessInfo,
    new Date('2099-07-01T08:00:00.000Z'),
  )).toThrow('Booking must be in the future');
});

test.each([
  [{}, 'Location time zone is not configured'],
  [{ timezone: 'Not/A_Timezone' }, 'Location time zone is invalid'],
])('server rejects an unusable location time zone %#', (timeZoneFields, message) => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const tenant = { settings: { allowOnlineBooking: true } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = {
    ...timeZoneFields,
    weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } },
  };

  expect(() => validateBookingSlot(
    validBooking,
    tenant,
    service,
    barber,
    businessInfo,
    new Date('2099-09-05T09:00:00.000Z'),
  )).toThrow(message);
});
