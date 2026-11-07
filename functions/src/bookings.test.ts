// @ts-nocheck
const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const nodeTest = require('node:test');
const describe = globalThis.describe ?? nodeTest.describe;
const runTest = globalThis.test ?? nodeTest.test;
const test = Object.assign((name, fn) => runTest(name, fn), {
  each: values => (name, fn) => values.forEach((value, index) => runTest(`${name} [${index}]`, () => fn(...value))),
});
// Run the existing lifecycle assertions with Node while Jest is unavailable.
// Every check delegates to the standard assertion library.
function nodeExpect(actual) {
  const checks = {
    toBe: expected => assert.strictEqual(actual, expected),
    toEqual: expected => assert.deepStrictEqual(actual, expected),
    toMatchObject: expected => assert.partialDeepStrictEqual(actual, expected),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toBeNull: () => assert.strictEqual(actual, null),
    toHaveLength: length => assert.strictEqual(actual.length, length),
    toThrow: message => assert.throws(actual, error => error.message.includes(message)),
  };
  Object.defineProperty(checks, 'resolves', { get: () => Object.fromEntries(
    Object.keys(checks).map(key => [key, async expected => nodeExpect(await actual)[key](expected)]),
  ) });
  Object.defineProperty(checks, 'rejects', { get: () => ({
    toThrow: message => assert.rejects(actual, error => error.message.includes(message)),
  }) });
  return checks;
}
const expect = globalThis.expect ?? nodeExpect;
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
let defaultFirestore;
function functionBuilder(options = {}) {
  return {
    https: { onCall: handler => Object.assign(handler, { run: handler, options }) },
    firestore: { document: () => ({
      onUpdate: handler => ({ run: handler }), onWrite: handler => ({ run: handler }),
    }) },
    runWith: next => functionBuilder({ ...options, ...next }),
  };
}
const sdk = {
  'firebase-functions': { https: { HttpsError }, region: region => functionBuilder({ region }) },
  'firebase-admin': { firestore: Object.assign(() => defaultFirestore, {
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
    FieldPath: { documentId: () => '__name__' },
  }) },
};
const sourceCache = new Map();

function loadBookings(relativePath = 'bookings.ts') {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  if (sourceCache.has(filename)) return sourceCache.get(filename).exports;
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  sourceCache.set(filename, loaded);
  new Function('require', 'module', 'exports', output)(request => request.startsWith('.')
    ? loadBookings(resolve(dirname(filename), `${request}.ts`))
    : sdk[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports;
}

const { transition, redactAddress, initialBookingStatus } = loadBookings();

describe('marketplace booking lifecycle', () => {
  test('completion trigger ignores legacy bookings without explicit isTest false', async () => {
    const { processCompletedBookingReferralFunction } = loadBookings();
    const change = {
      before: { data: () => ({ status: 'confirmed' }) },
      after: { data: () => ({ status: 'completed' }), updateTime: { toMillis: () => Date.now() } },
    };

    await expect(processCompletedBookingReferralFunction.run(change, {
      params: { bookingId: 'legacy-booking' }, eventId: 'event-legacy',
    })).resolves.toBeNull();
  });

  test('allows an approval request to become confirmed but not completed', () => {
    expect(transition('pending_approval', 'confirmed')).toBe('confirmed');
    expect(() => transition('pending_approval', 'completed'))
      .toThrow('Invalid booking transition');
  });

  test('keeps an unaccepted home address out of the booking response', () => {
    const address = { line1: '12 rue des Fleurs', city: 'Paris', postalCode: '75011' };

    expect(redactAddress('pending_approval', address)).toBeUndefined();
    expect(redactAddress('confirmed', address)).toEqual(address);
  });

  test.each([
    [{ type: 'salon', bookingPolicy: 'automatic' }, 'confirmed'],
    [{ type: 'salon', bookingPolicy: 'manual' }, 'pending_approval'],
    [{ type: 'freelancer', bookingPolicy: 'automatic' }, 'pending_approval'],
  ])('sets the correct initial status for %#', (owner, expected) => {
    expect(initialBookingStatus(owner)).toBe(expected);
  });

  test('atomically reserves an available automatic salon slot', async () => {
    const { createMarketplaceBooking } = loadBookings();
    const state = {
      publicProfiles: {
        'salon__location-a': {
          kind: 'salon', visible: true, approvalStatus: 'approved', serviceIds: ['cut'], homeVisit: false,
        },
      },
      salonLocations: { 'location-a': { brandId: 'brand-a', bookingPolicy: 'automatic' } },
      availability: { 'location-a': { availableSlots: ['2099-09-05T10:30'] } },
      bookingRequests: {},
      bookingRequestPrivate: {},
      auditEvents: {},
    };
    const firestore = {
      collection(name) {
        return {
          doc(id) {
            return { collectionName: name, id: id ?? (name === 'bookingRequests' ? 'booking-a' : 'audit-a') };
          },
        };
      },
      runTransaction: async callback => callback({
        getAll: async (...refs) => refs.map(ref => ({
          exists: Boolean(state[ref.collectionName]?.[ref.id]),
          id: ref.id,
          data: () => state[ref.collectionName]?.[ref.id],
        })),
        create(ref, value) {
          state[ref.collectionName][ref.id] = value;
        },
        update(ref, value) {
          state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
        },
      }),
    };

    const result = await createMarketplaceBooking('client-a', {
      profileId: 'salon__location-a',
      serviceId: 'cut',
      date: '2099-09-05',
      time: '10:30',
      clientName: 'Ada Client',
    }, firestore);

    expect(result).toEqual({ bookingId: 'booking-a', status: 'confirmed' });
    expect(state.availability['location-a']).toMatchObject({
      availableSlots: [], reservedSlots: ['2099-09-05T10:30'],
    });
    expect(state.bookingRequests['booking-a']).toMatchObject({
      ownerId: 'location-a', ownerType: 'salon', clientId: 'client-a', status: 'confirmed',
    });
  });

  test('rejects a second booking after the first transaction consumes the slot', async () => {
    const { createMarketplaceBooking } = loadBookings();
    const state = {
      publicProfiles: {
        'salon__location-a': {
          kind: 'salon', visible: true, approvalStatus: 'approved', serviceIds: ['cut'], homeVisit: false,
        },
      },
      salonLocations: { 'location-a': { brandId: 'brand-a', bookingPolicy: 'automatic' } },
      availability: { 'location-a': { availableSlots: ['2099-09-05T10:30'] } },
      bookingRequests: {}, bookingRequestPrivate: {}, auditEvents: {},
    };
    const firestore = basicTransactionFirestore(state);
    const request = {
      profileId: 'salon__location-a', serviceId: 'cut', date: '2099-09-05', time: '10:30',
      clientName: 'Ada Client',
    };

    await expect(createMarketplaceBooking('client-a', request, firestore)).resolves.toMatchObject({
      status: 'confirmed',
    });
    await expect(createMarketplaceBooking('client-b', {
      ...request, clientName: 'Bob Client',
    }, firestore)).rejects.toThrow('no longer available');
    expect(Object.values(state.bookingRequests)).toHaveLength(1);
  });

  test('releases a home address only to the freelancer who accepts the request', async () => {
    const { respondToMarketplaceBooking } = loadBookings();
    const state = {
      bookingRequests: { 'booking-a': { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'pending_approval' } },
      bookingRequestPrivate: { 'booking-a': { address: { line1: '12 rue des Fleurs', city: 'Paris' } } },
      auditEvents: {}, availability: {},
    };
    const firestore = {
      collection(name) { return { doc(id) { const ref = { collectionName: name, id: id ?? 'audit-a' }; return { ...ref, get: async () => ({ exists: Boolean(state[name][ref.id]), data: () => state[name][ref.id] }) }; } }; },
      runTransaction: async callback => callback({
        getAll: async (...refs) => refs.map(ref => ({ exists: Boolean(state[ref.collectionName][ref.id]), data: () => state[ref.collectionName][ref.id] })),
        create(ref, value) { state[ref.collectionName][ref.id] = value; },
        update(ref, value) { state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value }; },
      }),
    };

    const response = await respondToMarketplaceBooking('freelancer-a', { bookingId: 'booking-a', decision: 'accept' }, firestore);

    expect(response).toMatchObject({ status: 'confirmed', address: { line1: '12 rue des Fleurs', city: 'Paris' } });
    expect(state.bookingRequests['booking-a']).toMatchObject({ status: 'confirmed', addressReleased: true });
  });

  test('does not read availability after writing a freelancer decline', async () => {
    const { respondToMarketplaceBooking } = loadBookings();
    const state = { bookingRequests: { 'booking-a': { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'pending_approval' } }, bookingRequestPrivate: {}, availability: { 'freelancer-a': { availableSlots: [], reservedSlots: ['2099-09-05T10:30'] } }, auditEvents: {} };
    const firestore = orderedTransactionFirestore(state);

    await expect(respondToMarketplaceBooking('freelancer-a', { bookingId: 'booking-a', decision: 'decline' }, firestore)).resolves.toMatchObject({ status: 'declined' });
    expect(state.availability['freelancer-a']).toMatchObject({
      availableSlots: ['2099-09-05T10:30'], reservedSlots: [],
    });
  });

  test('does not restore a declined slot removed from explicit configuredSlots', async () => {
    const { respondToMarketplaceBooking } = loadBookings();
    const slot = '2099-09-05T10:30';
    const state = {
      bookingRequests: {
        'booking-a': {
          ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a',
          serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'pending_approval',
        },
      },
      bookingRequestPrivate: {},
      availability: {
        'freelancer-a': { configuredSlots: [], availableSlots: [], reservedSlots: [slot] },
      },
      auditEvents: {},
    };
    const firestore = orderedTransactionFirestore(state);

    await expect(respondToMarketplaceBooking(
      'freelancer-a', { bookingId: 'booking-a', decision: 'decline' }, firestore,
    )).resolves.toMatchObject({ status: 'declined' });
    expect(state.availability['freelancer-a']).toMatchObject({
      configuredSlots: [], availableSlots: [], reservedSlots: [],
    });
  });

  test('does not read availability after writing a client cancellation', async () => {
    const { cancelMarketplaceBooking } = loadBookings();
    const state = { bookingRequests: { 'booking-a': { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'confirmed' } }, bookingRequestPrivate: {}, availability: { 'freelancer-a': { availableSlots: [], reservedSlots: ['2099-09-05T10:30'] } }, auditEvents: {} };
    const firestore = orderedTransactionFirestore(state);

    await expect(cancelMarketplaceBooking('client-a', 'booking-a', firestore)).resolves.toEqual({ bookingId: 'booking-a', status: 'cancelled' });
    expect(state.availability['freelancer-a']).toMatchObject({
      availableSlots: ['2099-09-05T10:30'], reservedSlots: [],
    });
  });

  test('does not restore a cancelled slot after configuredSlots was explicitly emptied', async () => {
    const { cancelMarketplaceBooking } = loadBookings();
    const slot = '2099-09-05T10:30';
    const state = {
      bookingRequests: {
        'booking-a': {
          ownerId: 'location-a', ownerType: 'salon', clientId: 'client-a',
          serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'confirmed',
        },
      },
      bookingRequestPrivate: {},
      availability: {
        'location-a': { configuredSlots: [], availableSlots: [], reservedSlots: [slot] },
      },
      auditEvents: {},
    };
    const firestore = orderedTransactionFirestore(state);

    await expect(cancelMarketplaceBooking('client-a', 'booking-a', firestore))
      .resolves.toEqual({ bookingId: 'booking-a', status: 'cancelled' });
    expect(state.availability['location-a']).toMatchObject({
      configuredSlots: [], availableSlots: [], reservedSlots: [],
    });
  });

  test('rejects a freelancer booking when the public profile has not enabled home visits', async () => {
    const { createMarketplaceBooking } = loadBookings();
    const state = { publicProfiles: { 'freelancer__freelancer-a': { kind: 'freelancer', visible: true, approvalStatus: 'approved', serviceIds: ['cut'], homeVisit: false } }, freelancerProfiles: { 'freelancer-a': {} }, availability: { 'freelancer-a': { availableSlots: ['2099-09-05T10:30'] } }, bookingRequests: {}, bookingRequestPrivate: {}, auditEvents: {} };
    const firestore = basicTransactionFirestore(state);

    await expect(createMarketplaceBooking('client-a', { profileId: 'freelancer__freelancer-a', serviceId: 'cut', date: '2099-09-05', time: '10:30', clientName: 'Ada Client', homeAddress: { line1: '12 rue des Fleurs', city: 'Paris' } }, firestore)).rejects.toThrow('Home visits are not available');
  });

  test('rejects caller-supplied coordinates instead of trusting them for a home visit', () => {
    const { parseMarketplaceBookingInput } = loadBookings();

    expect(() => parseMarketplaceBookingInput({
      profileId: 'freelancer__freelancer-a', serviceId: 'cut',
      date: '2099-09-05', time: '10:30', clientName: 'Ada Client',
      approximateArea: 'Paris 11e', approximateLocation: { latitude: 48.858, longitude: 2.36 },
      homeAddress: { line1: '12 rue des Fleurs', city: 'Paris' },
    })).toThrow('Server-owned booking fields cannot be supplied');
  });

  test('fails closed when no trusted geocoder and verified freelancer origin are configured', async () => {
    const { createMarketplaceBooking } = loadBookings();
    const state = {
      publicProfiles: {
        'freelancer__freelancer-a': {
          kind: 'freelancer', visible: true, approvalStatus: 'approved',
          serviceIds: ['cut'], homeVisit: true,
        },
      },
      freelancerProfiles: {
        'freelancer-a': {
          radiusKm: 5, travelFeeMinor: 800, cancellationWindowHours: 24,
          servicePricesMinor: { cut: 2500 },
          publicProfile: { latitude: 48.8566, longitude: 2.3522 },
        },
      },
      availability: { 'freelancer-a': { availableSlots: ['2099-09-05T10:30'] } },
      bookingRequests: {}, bookingRequestPrivate: {}, auditEvents: {},
    };
    const firestore = basicTransactionFirestore(state);

    await expect(createMarketplaceBooking('client-a', {
      profileId: 'freelancer__freelancer-a', serviceId: 'cut',
      date: '2099-09-05', time: '10:30', clientName: 'Ada Client',
      approximateArea: 'Paris 11e',
      homeAddress: { line1: '12 rue des Fleurs', city: 'Paris' },
    }, firestore)).rejects.toThrow('cannot be verified');
    expect(state.bookingRequests).toEqual({});
    expect(state.availability['freelancer-a'].availableSlots).toEqual(['2099-09-05T10:30']);
  });

  test('converts France appointment wall time with Europe/Paris DST rules', () => {
    const { appointmentEpochMsInParis, cancellationDeadlineMsInParis } = loadBookings();

    expect(appointmentEpochMsInParis('2099-01-05', '10:30'))
      .toBe(Date.parse('2099-01-05T09:30:00.000Z'));
    expect(appointmentEpochMsInParis('2099-07-05', '10:30'))
      .toBe(Date.parse('2099-07-05T08:30:00.000Z'));
    expect(cancellationDeadlineMsInParis('2099-07-05', '10:30', 24))
      .toBe(Date.parse('2099-07-04T08:30:00.000Z'));
    expect(() => appointmentEpochMsInParis('2026-03-29', '02:30'))
      .toThrow('does not exist in Europe/Paris');
    expect(() => appointmentEpochMsInParis('2026-10-25', '02:30'))
      .toThrow('is ambiguous in Europe/Paris');
  });

  test('prevents client cancellation after the snapshotted cancellation deadline', async () => {
    const { cancelMarketplaceBooking } = loadBookings();
    const state = {
      bookingRequests: {
        'booking-a': {
          ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a',
          serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'confirmed',
          cancellationDeadlineMs: 2_000,
        },
      },
      availability: {
        'freelancer-a': { availableSlots: [], reservedSlots: ['2099-09-05T10:30'] },
      },
      auditEvents: {},
    };
    const firestore = orderedTransactionFirestore(state);

    await expect(cancelMarketplaceBooking(
      'client-a', 'booking-a', firestore, new Date(2_001),
    )).rejects.toThrow('cancellation window has closed');
    expect(state.bookingRequests['booking-a'].status).toBe('confirmed');
    expect(state.availability['freelancer-a'].reservedSlots).toEqual(['2099-09-05T10:30']);
  });

  test('enforces a corrected Paris deadline instead of a stale UTC-derived snapshot', async () => {
    const { cancelMarketplaceBooking } = loadBookings();
    const state = {
      bookingRequests: {
        'booking-a': {
          ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a',
          serviceId: 'cut', date: '2099-07-05', time: '10:30', status: 'confirmed',
          cancellationWindowHours: 24,
          cancellationDeadlineMs: Date.parse('2099-07-04T10:30:00.000Z'),
        },
      },
      availability: {
        'freelancer-a': {
          configuredSlots: ['2099-07-05T10:30'], availableSlots: [],
          reservedSlots: ['2099-07-05T10:30'],
        },
      },
      auditEvents: {},
    };
    const firestore = orderedTransactionFirestore(state);

    await expect(cancelMarketplaceBooking(
      'client-a', 'booking-a', firestore, new Date('2099-07-04T09:00:00.000Z'),
    )).rejects.toThrow('cancellation window has closed');
    expect(state.bookingRequests['booking-a'].status).toBe('confirmed');
  });

  test('returns an exact address only to the client or accepting freelancer after confirmation', async () => {
    const { getMarketplaceBookingAddress } = loadBookings();
    const state = { bookingRequests: { 'booking-a': { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', status: 'confirmed' } }, bookingRequestPrivate: { 'booking-a': { address: { line1: '12 rue des Fleurs', city: 'Paris' } } } };
    const firestore = readFirestore(state);

    await expect(getMarketplaceBookingAddress('freelancer-a', 'booking-a', firestore)).resolves.toEqual({ line1: '12 rue des Fleurs', city: 'Paris' });
    await expect(getMarketplaceBookingAddress('client-a', 'booking-a', firestore)).resolves.toEqual({ line1: '12 rue des Fleurs', city: 'Paris' });
    await expect(getMarketplaceBookingAddress('stranger', 'booking-a', firestore)).rejects.toThrow('not authorized');
    state.bookingRequests['booking-a'].status = 'pending_approval';
    await expect(getMarketplaceBookingAddress('freelancer-a', 'booking-a', firestore)).rejects.toThrow('not available before acceptance');
  });

  test('lets an exact-location booking manager configure salon slots without reopening reservations', async () => {
    const { saveSalonAvailability } = loadBookings();
    const reservedSlot = '2099-09-05T10:30';
    const state = {
      salonLocations: { 'location-a': { brandId: 'brand-a' } },
      memberships: {
        'brand-a__location-a__manager-a': {
          userId: 'manager-a', brandId: 'brand-a', locationId: 'location-a', status: 'active',
          permissions: { manageBookings: true },
        },
      },
      availability: {
        'location-a': {
          ownerId: 'location-a', ownerType: 'salon',
          configuredSlots: [reservedSlot, '2099-09-05T11:30'],
          availableSlots: ['2099-09-05T11:30'], reservedSlots: [reservedSlot],
        },
      },
      auditEvents: {},
    };
    const firestore = scopedFirestore(state);

    await expect(saveSalonAvailability('manager-a', {
      locationId: 'location-a', configuredSlots: [reservedSlot, '2099-09-05T11:30'],
    }, firestore)).resolves.toEqual({
      locationId: 'location-a',
      configuredSlots: [reservedSlot, '2099-09-05T11:30'],
      availableSlots: ['2099-09-05T11:30'],
    });
    expect(state.availability['location-a']).toMatchObject({
      ownerId: 'location-a', ownerType: 'salon',
      configuredSlots: [reservedSlot, '2099-09-05T11:30'],
      availableSlots: ['2099-09-05T11:30'], reservedSlots: [reservedSlot],
    });

    await expect(saveSalonAvailability('outsider-a', {
      locationId: 'location-a', configuredSlots: ['2099-09-05T12:30'],
    }, firestore)).rejects.toThrow('Permission denied');
  });

  test('lists only exact-location salon booking requests for an authorized manager', async () => {
    const { listSalonBookingWorkspace } = loadBookings();
    const state = {
      salonLocations: { 'location-a': { brandId: 'brand-a' } },
      memberships: {
        'brand-a__principal__principal-a': {
          userId: 'principal-a', brandId: 'brand-a', role: 'principal_admin', status: 'active',
        },
      },
      availability: {
        'location-a': {
          ownerId: 'location-a', ownerType: 'salon',
          configuredSlots: ['2099-09-05T10:30', '2099-09-05T11:30'],
          availableSlots: ['2099-09-05T11:30'], reservedSlots: ['2099-09-05T10:30'],
        },
      },
      bookingRequests: {
        'booking-a': {
          profileId: 'salon__location-a', ownerId: 'location-a', ownerType: 'salon',
          brandId: 'brand-a', locationId: 'location-a', clientId: 'client-a', clientName: 'Ada',
          serviceId: 'cut', date: '2099-09-05', time: '11:30', status: 'pending_approval',
        },
        'booking-cross-brand': {
          profileId: 'salon__location-a', ownerId: 'location-a', ownerType: 'salon',
          brandId: 'brand-b', locationId: 'location-a', clientId: 'client-b', clientName: 'Eve',
          serviceId: 'cut', date: '2099-09-05', time: '12:30', status: 'pending_approval',
        },
        'booking-other-location': {
          profileId: 'salon__location-b', ownerId: 'location-b', ownerType: 'salon',
          brandId: 'brand-a', locationId: 'location-b', clientId: 'client-c', clientName: 'Bob',
          serviceId: 'cut', date: '2099-09-05', time: '13:30', status: 'pending_approval',
        },
      },
    };
    const firestore = scopedFirestore(state);

    await expect(listSalonBookingWorkspace('principal-a', {
      locationId: 'location-a',
    }, firestore)).resolves.toEqual({
      locationId: 'location-a',
      configuredSlots: ['2099-09-05T10:30', '2099-09-05T11:30'],
      availableSlots: ['2099-09-05T11:30'],
      bookings: [{ id: 'booking-a', clientId: 'client-a', clientName: 'Ada',
        profileId: 'salon__location-a', ownerId: 'location-a', ownerType: 'salon',
        serviceId: 'cut', date: '2099-09-05', time: '11:30', status: 'pending_approval' }],
    });
  });

  test('allows an exact-location booking manager to respond to a manual salon request', async () => {
    const { respondToMarketplaceBooking } = loadBookings();
    const state = {
      bookingRequests: {
        'booking-a': {
          profileId: 'salon__location-a', ownerId: 'location-a', ownerType: 'salon',
          brandId: 'brand-a', locationId: 'location-a', clientId: 'client-a', clientName: 'Ada',
          serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'pending_approval',
        },
      },
      bookingRequestPrivate: {},
      memberships: {
        'brand-a__location-a__manager-a': {
          userId: 'manager-a', brandId: 'brand-a', locationId: 'location-a', status: 'active',
          permissions: { manageBookings: true },
        },
      },
      availability: { 'location-a': { availableSlots: [], reservedSlots: ['2099-09-05T10:30'] } },
      auditEvents: {},
    };
    const firestore = scopedFirestore(state);

    await expect(respondToMarketplaceBooking('manager-a', {
      bookingId: 'booking-a', decision: 'accept',
    }, firestore)).resolves.toMatchObject({ id: 'booking-a', status: 'confirmed' });
    expect(state.bookingRequests['booking-a']).toMatchObject({ status: 'confirmed', statusUpdatedBy: 'manager-a' });
  });
});

function readFirestore(state) {
  return { collection(name) { return { doc(id) { return { collectionName: name, id, get: async () => ({ exists: Boolean(state[name]?.[id]), data: () => state[name]?.[id] }) }; } }; } };
}

const publicHomeSlot = '2099-09-05T10:00';
const publicChairSlot = '2099-09-05T11:00';
const publicWorkplace = { name: 'Studio République', line1: '10 rue du Temple', postalCode: '75003', city: 'Paris' };
const publicRequest = {
  publicSlug: 'amine-fade', serviceId: 'cut', appointmentMode: 'chair', date: '2099-09-05', time: '11:00',
  clientName: 'Ada Client', clientEmail: 'ada@example.test', clientPhone: '+33612345678',
  clientRequestId: '5ab1ddea-7c82-4c19-9545-40781b317b01',
};
const publicHomeRequest = { ...publicRequest, appointmentMode: 'home', time: '10:00', approximateArea: 'Paris 11e',
  homeAddress: { line1: '12 rue des Fleurs', city: 'Paris', postalCode: '75011' } };
function publicBookingFixture() {
  const raw = {
    uid: 'freelancer-a', visible: true, identity: { publicSlug: 'amine-fade' },
    publicProfile: { approvalStatus: 'pending' }, serviceIds: ['cut'], servicePricesMinor: { cut: 2500 },
    serviceDurationMinutes: { cut: 45 }, travelFeeMinor: 500, cancellationWindowHours: 24,
    workModes: { home: true, chair: true }, workplace: { ...publicWorkplace },
    availabilityByMode: { home: [publicHomeSlot], chair: [publicChairSlot] },
  };
  return {
    publicProfileSlugs: { 'amine-fade': { freelancerId: 'freelancer-a', profileId: 'freelancer__freelancer-a' } },
    publicProfiles: { 'freelancer__freelancer-a': {
      kind: 'freelancer', visible: true, approvalStatus: 'pending', publicSlug: 'amine-fade',
      serviceIds: ['cut'], services: [{ id: 'cut', label: 'Coupe', priceMinor: 2500, durationMinutes: 45 }],
      workModes: { home: true, chair: true }, workplace: { ...publicWorkplace }, cancellationWindowHours: 24,
    } },
    freelancerProfiles: { 'freelancer-a': raw },
    availability: { 'freelancer-a': {
      ownerId: 'freelancer-a', ownerType: 'freelancer', configuredSlots: [publicHomeSlot, publicChairSlot],
      availableSlots: [publicHomeSlot, publicChairSlot], reservedSlots: [],
      modeBySlot: { [publicHomeSlot]: 'home', [publicChairSlot]: 'chair' },
    } },
    bookingRequests: {}, bookingRequestPrivate: {}, auditEvents: {},
  };
}
// Stage writes atomically, reject reads after writes, and serialize competitors
// to model a Firestore transaction's retry against the latest committed state.
function publicBookingStore(initial = publicBookingFixture()) {
  const state = structuredClone(initial);
  let nextId = 0;
  let queue = Promise.resolve();
  const snapshot = ref => ({ id: ref.id, exists: state[ref.collectionName]?.[ref.id] !== undefined,
    data: () => structuredClone(state[ref.collectionName]?.[ref.id]) });
  const firestore = {
    collection: collectionName => ({ doc: (id = `auto-${++nextId}`) => {
      const ref = { collectionName, id };
      return { ...ref, get: async () => snapshot(ref) };
    } }),
    runTransaction(callback) {
      const run = queue.then(async () => {
        const staged = [];
        const read = ref => { assert.equal(staged.length, 0, 'All reads must precede writes'); return snapshot(ref); };
        const result = await callback({ get: async ref => read(ref), getAll: async (...refs) => refs.map(read),
          create(ref, value) { assert.equal(snapshot(ref).exists, false); staged.push([ref, value]); },
          update(ref, value) { assert.equal(snapshot(ref).exists, true); staged.push([ref, { ...snapshot(ref).data(), ...value }]); },
        });
        for (const [ref, value] of staged) { state[ref.collectionName] ??= {}; state[ref.collectionName][ref.id] = value; }
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { state, firestore };
}
function publicCreator() {
  const create = loadBookings().createPublicFreelancerBooking;
  assert.equal(typeof create, 'function', 'Public freelancer creation must be exported');
  return create;
}

test('public chair booking snapshots commercial details and has no private address or travel fee', async () => {
  const create = publicCreator();
  const { state, firestore } = publicBookingStore();
  const result = await create('anon-client', publicRequest, firestore);
  assert.deepStrictEqual(result, { bookingId: `anon-client_${publicRequest.clientRequestId}`, status: 'pending_approval' });
  const booking = state.bookingRequests[result.bookingId];
  assert.partialDeepStrictEqual(booking, {
    clientId: 'anon-client', guestBooking: true, appointmentMode: 'chair', status: 'pending_approval',
    profileId: 'freelancer__freelancer-a', ownerId: 'freelancer-a', ownerType: 'freelancer',
    servicePriceMinor: 2500, durationMinutes: 45, cancellationWindowHours: 24,
    cancellationDeadlineMs: Date.parse('2099-09-04T09:00:00Z'), workplaceSnapshot: publicWorkplace,
  });
  assert.equal(booking.homeAddress, undefined); assert.equal(booking.address, undefined);
  assert.equal(booking.travelFeeMinor, undefined); assert.equal(state.bookingRequestPrivate[result.bookingId], undefined);
  assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, [publicHomeSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, [publicChairSlot]);
});

test('public home booking remains pending and keeps its exact address only in private storage until acceptance', async () => {
  const create = publicCreator();
  const { state, firestore } = publicBookingStore();
  const result = await create('anon-client', publicHomeRequest, firestore);
  assert.partialDeepStrictEqual(state.bookingRequests[result.bookingId], {
    appointmentMode: 'home', status: 'pending_approval', servicePriceMinor: 2500, travelFeeMinor: 500,
    approximateArea: 'Paris 11e', addressReleased: false,
  });
  assert.deepStrictEqual(state.bookingRequestPrivate[result.bookingId].address, publicHomeRequest.homeAddress);
  for (const collection of ['bookingRequests', 'auditEvents']) {
    assert.equal(JSON.stringify(state[collection]).includes('12 rue des Fleurs'), false);
  }
  assert.equal(state.bookingRequests[result.bookingId].workplaceSnapshot, undefined);
  assert.equal(state.bookingRequests[result.bookingId].distanceKm, undefined);
  assert.equal(state.bookingRequests[result.bookingId].radiusMatch, undefined);
  const api = loadBookings();
  await assert.rejects(api.getMarketplaceBookingAddress('freelancer-a', result.bookingId, firestore), { code: 'failed-precondition' });
  const accepted = await api.respondToMarketplaceBooking('freelancer-a', { bookingId: result.bookingId, decision: 'accept' }, firestore);
  assert.deepStrictEqual(accepted.address, publicHomeRequest.homeAddress);
  await assert.rejects(api.getMarketplaceBookingAddress('stranger', result.bookingId, firestore), { code: 'permission-denied' });
});

test('public booking prices survive the existing workspace booking parser for both modes', async () => {
  const create = publicCreator();
  const parse = loadBookings(resolve(__dirname, '../../src/app/lib/marketplace/bookingRecords.ts')).parseMarketplaceBooking;
  for (const [request, totalPriceMinor] of [[publicRequest, 2500], [publicHomeRequest, 3000]]) {
    const { state, firestore } = publicBookingStore();
    const result = await create('anon-client', request, firestore);
    const parsed = parse(result.bookingId, 'anon-client', state.bookingRequests[result.bookingId]);
    assert.equal(parsed.servicePriceMinor, 2500);
    assert.equal(parsed.totalPriceMinor, totalPriceMinor);
  }
});

test('changing only a private home address cannot change any browser-readable booking or audit field', async () => {
  const create = publicCreator(); const first = publicBookingStore(); const second = publicBookingStore();
  await create('anon-client', publicHomeRequest, first.firestore);
  await create('anon-client', { ...publicHomeRequest, homeAddress: { ...publicHomeRequest.homeAddress, line1: '14 rue des Fleurs' } }, second.firestore);
  assert.deepStrictEqual(first.state.bookingRequests, second.state.bookingRequests);
  assert.deepStrictEqual(first.state.auditEvents, second.state.auditEvents);
  assert.notDeepStrictEqual(first.state.bookingRequestPrivate, second.state.bookingRequestPrivate);
});

test('failed private creation rolls the entire home reservation back', async () => {
  const create = publicCreator(); const initial = publicBookingFixture();
  const id = `anon-client_${publicRequest.clientRequestId}`;
  initial.bookingRequestPrivate[id] = { clientId: 'different-client', address: publicHomeRequest.homeAddress };
  const { state, firestore } = publicBookingStore(initial);
  await assert.rejects(create('anon-client', publicHomeRequest, firestore));
  assert.deepStrictEqual(state.bookingRequests, {}); assert.deepStrictEqual(state.auditEvents, {});
  assert.deepStrictEqual(state.availability, initial.availability);
});

test('identical public submissions converge to one booking and return its saved current status even after unpublishing', async () => {
  const create = publicCreator();
  const { state, firestore } = publicBookingStore();
  const [first, second] = await Promise.all([create('anon-client', publicHomeRequest, firestore), create('anon-client', publicHomeRequest, firestore)]);
  assert.deepStrictEqual(second, first); assert.equal(Object.keys(state.bookingRequests).length, 1);
  assert.equal(Object.keys(state.auditEvents).length, 1); assert.equal(Object.keys(state.bookingRequestPrivate).length, 1);
  state.bookingRequests[first.bookingId].status = 'cancelled';
  delete state.publicProfileSlugs['amine-fade']; delete state.publicProfiles['freelancer__freelancer-a'];
  const replay = await create('anon-client', publicHomeRequest, firestore);
  assert.deepStrictEqual(replay, { bookingId: first.bookingId, status: 'cancelled' });
});

for (const [field, replacement] of Object.entries({
  publicSlug: 'someone-else', serviceId: 'beard', appointmentMode: 'chair', date: '2099-09-06', time: '12:00',
  clientName: 'Different', clientEmail: 'other@example.test', clientPhone: '+33712345678', approximateArea: 'Paris 12e',
  homeAddress: { line1: 'Different street', city: 'Paris' },
})) test(`public idempotency rejects changing ${field} under the same request id`, async () => {
  const create = publicCreator(); const { state, firestore } = publicBookingStore();
  await create('anon-client', publicHomeRequest, firestore);
  const changed = { ...publicHomeRequest, [field]: replacement };
  if (field === 'appointmentMode') delete changed.homeAddress;
  await assert.rejects(create('anon-client', changed, firestore), { code: 'already-exists' });
  assert.equal(Object.keys(state.bookingRequests).length, 1); assert.equal(Object.keys(state.auditEvents).length, 1);
});

test('competing public clients cannot reserve the same slot and the request id is scoped to the caller', async () => {
  const create = publicCreator(); const { state, firestore } = publicBookingStore();
  const outcomes = await Promise.allSettled([create('client-a', publicRequest, firestore), create('client-b', publicRequest, firestore)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'failed-precondition');
  assert.equal(Object.keys(state.bookingRequests).length, 1);
  const another = await create('client-b', publicHomeRequest, firestore);
  assert.equal(another.bookingId, `client-b_${publicRequest.clientRequestId}`);
  assert.equal(Object.keys(state.bookingRequests).length, 2);
});

for (const [name, patch] of [
  ['server field', { ownerId: 'attacker' }], ['price injection', { priceMinor: 1 }], ['profile id', { profileId: 'freelancer__x' }],
  ['distance injection', { customerDistanceKm: 0 }], ['UUID', { clientRequestId: 'retry' }],
  ['invalid date', { date: '2099-02-30' }], ['invalid time', { time: '24:00' }], ['mode', { appointmentMode: 'salon' }],
  ['empty name', { clientName: ' ' }], ['long name', { clientName: 'a'.repeat(121) }],
  ['missing email', { clientEmail: undefined }], ['email', { clientEmail: 'bad-email' }],
  ['missing phone', { clientPhone: undefined }], ['long phone', { clientPhone: '1'.repeat(41) }],
  ['long approximate area', { approximateArea: 'a'.repeat(121) }],
  ['chair address', { homeAddress: publicHomeRequest.homeAddress }], ['chair null address', { homeAddress: null }],
  ['home missing address', { appointmentMode: 'home' }],
  ['home address extra key', { appointmentMode: 'home', homeAddress: { ...publicHomeRequest.homeAddress, latitude: 48 } }],
]) test(`public input rejects ${name} without writing`, async () => {
  const create = publicCreator(); const { state, firestore } = publicBookingStore();
  await assert.rejects(create('anon-client', { ...publicRequest, ...patch }, firestore), { code: 'invalid-argument' });
  assert.deepStrictEqual(state.bookingRequests, {}); assert.deepStrictEqual(state.auditEvents, {});
});

for (const [name, change] of [
  ['missing slug', s => { s.publicProfileSlugs = {}; }],
  ['stale mapping', s => { s.publicProfileSlugs['amine-fade'].profileId = 'freelancer__other'; }],
  ['unsafe owner', s => { s.publicProfileSlugs['amine-fade'].freelancerId = '../other'; }],
  ['hidden projection', s => { s.publicProfiles['freelancer__freelancer-a'].visible = false; }],
  ['rejected projection', s => { s.publicProfiles['freelancer__freelancer-a'].approvalStatus = 'rejected'; }],
  ['renamed projection', s => { s.publicProfiles['freelancer__freelancer-a'].publicSlug = 'changed'; }],
  ['missing projected service', s => { s.publicProfiles['freelancer__freelancer-a'].services = []; }],
  ['raw owner removed', s => { s.freelancerProfiles = {}; }],
  ['raw hidden profile', s => { s.freelancerProfiles['freelancer-a'].visible = false; }],
  ['raw slug changed', s => { s.freelancerProfiles['freelancer-a'].identity.publicSlug = 'changed'; }],
  ['raw service removed', s => { s.freelancerProfiles['freelancer-a'].serviceIds = []; }],
  ['bad raw price', s => { s.freelancerProfiles['freelancer-a'].servicePricesMinor.cut = -1; }],
  ['bad raw duration', s => { s.freelancerProfiles['freelancer-a'].serviceDurationMinutes.cut = 0; }],
  ['bad cancellation policy', s => { s.freelancerProfiles['freelancer-a'].cancellationWindowHours = 721; }],
  ['missing commercial workplace', s => { delete s.freelancerProfiles['freelancer-a'].workplace; }],
  ['disabled mode', s => { s.freelancerProfiles['freelancer-a'].workModes.chair = false; }],
  ['wrong slot mode', s => { s.availability['freelancer-a'].modeBySlot[publicChairSlot] = 'home'; }],
  ['reserved slot', s => { s.availability['freelancer-a'].reservedSlots = [publicChairSlot]; }],
  ['missing reservation metadata', s => { delete s.availability['freelancer-a'].reservedSlots; }],
  ['foreign availability', s => { s.availability['freelancer-a'].ownerId = 'other'; }],
  ['removed configuration', s => { s.availability['freelancer-a'].configuredSlots = []; }],
  ['changed raw mode configuration', s => { s.freelancerProfiles['freelancer-a'].availabilityByMode.chair = []; }],
]) test(`public booking fails closed for ${name}`, async () => {
  const create = publicCreator(); const initial = publicBookingFixture(); change(initial);
  const { state, firestore } = publicBookingStore(initial);
  await assert.rejects(create('anon-client', publicRequest, firestore), error => ['not-found', 'failed-precondition'].includes(error.code));
  assert.deepStrictEqual(state.bookingRequests, {}); assert.deepStrictEqual(state.auditEvents, {});
});

for (const [date, time, now, succeeds, instant] of [
  ['2026-11-03', '10:00', '2026-11-03T09:30:00Z', false],
  ['2026-11-03', '10:30', '2026-11-03T09:30:00Z', false],
  ['2026-11-03', '10:31', '2026-11-03T09:30:00Z', true, '2026-11-03T09:31:00Z'],
  ['2026-07-03', '10:31', '2026-07-03T08:30:00Z', true, '2026-07-03T08:31:00Z'],
  ['2026-03-29', '02:30', '2026-03-28T00:00:00Z', false],
  ['2026-10-25', '02:30', '2026-10-24T00:00:00Z', false],
]) test(`public booking uses Paris wall time ${date} ${time}`, async () => {
  const create = publicCreator(); const initial = publicBookingFixture(); const slot = `${date}T${time}`;
  initial.availability['freelancer-a'] = { ownerId: 'freelancer-a', ownerType: 'freelancer',
    configuredSlots: [slot], availableSlots: [slot], reservedSlots: [], modeBySlot: { [slot]: 'chair' } };
  initial.freelancerProfiles['freelancer-a'].availabilityByMode.chair = [slot];
  const { state, firestore } = publicBookingStore(initial);
  const promise = create('anon-client', { ...publicRequest, date, time }, firestore, new Date(now));
  if (!succeeds) { await assert.rejects(promise); assert.deepStrictEqual(state.bookingRequests, {}); }
  else {
    const result = await promise;
    assert.equal(state.bookingRequests[result.bookingId].appointmentEpochMs, Date.parse(instant));
    assert.equal(state.bookingRequests[result.bookingId].cancellationDeadlineMs, Date.parse(instant) - 86400000);
  }
});

for (const action of ['cancel', 'decline']) for (const mode of ['home', 'chair']) {
  for (const change of ['same', 'removed', 'switched', 'disabled']) test(`${action} ${mode} restores only the still configured appointment mode: ${change}`, async () => {
    const initial = publicBookingFixture(); const slot = mode === 'home' ? publicHomeSlot : publicChairSlot;
    initial.bookingRequests['booking-a'] = { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'anon-client',
      appointmentMode: mode, date: '2099-09-05', time: mode === 'home' ? '10:00' : '11:00', status: 'pending_approval' };
    initial.availability['freelancer-a'].availableSlots = [];
    initial.availability['freelancer-a'].reservedSlots = [slot];
    const raw = initial.freelancerProfiles['freelancer-a'];
    if (change === 'removed') initial.availability['freelancer-a'].configuredSlots = [];
    if (change === 'switched') { raw.availabilityByMode[mode] = []; raw.availabilityByMode[mode === 'home' ? 'chair' : 'home'].push(slot); }
    if (change === 'disabled') raw.workModes[mode] = false;
    const { state, firestore } = publicBookingStore(initial); const api = loadBookings();
    if (action === 'cancel') await api.cancelMarketplaceBooking('anon-client', 'booking-a', firestore);
    else await api.respondToMarketplaceBooking('freelancer-a', { bookingId: 'booking-a', decision: 'decline' }, firestore);
    assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, change === 'same' ? [slot] : []);
    assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, []);
  });
}

test('public callable enforces App Check consumption and European concurrency settings at registration', async () => {
  const handler = loadBookings().requestPublicFreelancerBookingFunction;
  assert.equal(typeof handler, 'function');
  assert.deepStrictEqual(handler.options, { region: 'europe-west1', enforceAppCheck: true, consumeAppCheckToken: true, maxInstances: 2 });
  const { state, firestore } = publicBookingStore(); defaultFirestore = firestore;
  for (const [context, code] of [
    [{}, 'unauthenticated'], [{ app: { appId: 'app' } }, 'unauthenticated'],
    [{ auth: { uid: 'anon-client' } }, 'failed-precondition'],
    [{ auth: { uid: 'anon-client' }, app: { appId: 'app', alreadyConsumed: true } }, 'failed-precondition'],
  ]) {
    await assert.rejects(async () => handler(publicRequest, context), { code });
    assert.deepStrictEqual(state.bookingRequests, {});
  }
  await assert.rejects(publicCreator()(null, publicRequest, firestore), { code: 'unauthenticated' });
  const result = await handler(publicRequest, { auth: { uid: 'anon-client' }, app: { appId: 'app', alreadyConsumed: false } });
  assert.equal(result.status, 'pending_approval'); assert.equal(Object.keys(state.bookingRequests).length, 1);
});

function basicTransactionFirestore(state) {
  let nextId = 0;
  const firestore = {
    collection(name) {
      return {
        doc(id) {
          const resolvedId = id ?? (name === 'bookingRequests' ? 'booking-a' : `${name}-${++nextId}`);
          return {
            collectionName: name,
            id: resolvedId,
            get: async () => ({
              exists: Boolean(state[name]?.[resolvedId]),
              data: () => state[name]?.[resolvedId],
            }),
          };
        },
      };
    },
  };
  firestore.runTransaction = async callback => callback({
    getAll: async (...refs) => refs.map(ref => ({ exists: Boolean(state[ref.collectionName]?.[ref.id]), data: () => state[ref.collectionName]?.[ref.id] })),
    create(ref, value) { state[ref.collectionName][ref.id] = value; },
    update(ref, value) { state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value }; },
  });
  return firestore;
}

function orderedTransactionFirestore(state) {
  const firestore = basicTransactionFirestore(state);
  firestore.runTransaction = async callback => {
    let wrote = false;
    return callback({
      getAll: async (...refs) => {
        if (wrote) throw new Error('Firestore transactions require all reads before writes');
        return refs.map(ref => ({ exists: Boolean(state[ref.collectionName]?.[ref.id]), data: () => state[ref.collectionName]?.[ref.id] }));
      },
      create(ref, value) { wrote = true; state[ref.collectionName][ref.id] = value; },
      update(ref, value) { wrote = true; state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value }; },
    });
  };
  return firestore;
}

function scopedFirestore(state) {
  let nextId = 0;
  const collection = name => {
    const filters = [];
    const reference = {
      doc(id) {
        const resolvedId = id ?? `${name}-${++nextId}`;
        return {
          collectionName: name,
          id: resolvedId,
          get: async () => ({
            exists: Boolean(state[name]?.[resolvedId]),
            id: resolvedId,
            data: () => state[name]?.[resolvedId],
          }),
        };
      },
      where(field, operator, value) {
        expect(operator).toBe('==');
        filters.push([field, value]);
        return reference;
      },
      async get() {
        return {
          docs: Object.entries(state[name] ?? {}).filter(([, value]) => (
            filters.every(([field, expected]) => value[field] === expected)
          )).map(([id, value]) => ({ id, data: () => value })),
        };
      },
    };
    return reference;
  };
  const firestore = { collection };
  firestore.runTransaction = async callback => callback({
    getAll: async (...refs) => refs.map(ref => ({
      exists: Boolean(state[ref.collectionName]?.[ref.id]),
      id: ref.id,
      data: () => state[ref.collectionName]?.[ref.id],
    })),
    create(ref, value) {
      state[ref.collectionName] ??= {};
      state[ref.collectionName][ref.id] = value;
    },
    set(ref, value) {
      state[ref.collectionName] ??= {};
      state[ref.collectionName][ref.id] = value;
    },
    update(ref, value) {
      state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
    },
  });
  return firestore;
}
