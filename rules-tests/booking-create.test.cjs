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
  date: '2026-09-05',
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
    tenants: { 'tenant-a': { name: 'Tenant A' } },
    services: { 'service-a': { tenantId: 'tenant-a' } },
    barbers: { 'barber-a': { tenantId: 'tenant-a' } },
    bookings: {},
  };
  const firestore = {
    collection: name => ({
      doc: id => ({ collectionName: name, id: id ?? 'booking-a' }),
    }),
    runTransaction: async callback => callback({
      getAll: async (...refs) => refs.map(ref => ({
        exists: Boolean(state[ref.collectionName][ref.id]),
        data: () => state[ref.collectionName][ref.id],
      })),
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
  });
  expect(state.bookings['booking-a']).not.toHaveProperty('paymentMethod');
});
