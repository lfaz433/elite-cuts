const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath) {
  const filename = resolve(__dirname, '..', relativePath);
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
      ? require(resolve(dirname(filename), request))
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
    businessInfo: { info: { weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } } },
    bookings: {},
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
      create: (ref, value) => {
        state[ref.collectionName][ref.id] = value;
      },
    }),
  };

  await createBooking('tenant-a', null, validBooking, firestore);

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
  [{ date: '2020-01-01' }, 'Booking must be in the future'],
  [{ time: '19:00' }, 'Booking is outside location hours'],
])('server rejects invalid appointment timing %#', async (override, message) => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const booking = { ...validBooking, ...override };
  const tenant = { settings: { allowOnlineBooking: true } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [6], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = { weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } };

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
  const businessInfo = { weeklyHours: { saturday: { isOpen: true, open: '09:00', close: '18:00' } } };

  expect(() => validateBookingSlot(validBooking, tenant, service, barber, businessInfo, new Date('2099-09-05T09:00:00Z')))
    .toThrow(message);
});

test('public caller cannot bypass future-date validation by claiming a walk-in', () => {
  const { validateBookingSlot } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  const booking = { ...validBooking, type: 'sans-rdv', date: '2020-01-01', time: '10:30' };
  const tenant = { settings: { allowOnlineBooking: true } };
  const service = { duration: '30 min', price: '40' };
  const barber = { workingDays: [3], shiftStart: '09:00', shiftEnd: '18:00' };
  const businessInfo = { weeklyHours: { wednesday: { isOpen: true, open: '09:00', close: '18:00' } } };

  expect(() => validateBookingSlot(booking, tenant, service, barber, businessInfo, new Date('2099-09-05T09:00:00Z'), false))
    .toThrow('Walk-in booking requires staff authorization');
});

test('server detects an overlapping active booking', () => {
  const { assertNoBookingOverlap } = loadTypeScriptModule('functions/src/bookingCreate.ts');
  expect(() => assertNoBookingOverlap(validBooking, 30, [{
    barberId: 'barber-a', date: '2099-09-05', time: '10:45', durationMinutes: 30, status: 'approved',
  }])).toThrow('Booking slot is no longer available');
});
