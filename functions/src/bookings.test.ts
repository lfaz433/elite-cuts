// @ts-nocheck
const { readFileSync } = require('node:fs');
const { dirname, isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadBookings(relativePath = 'bookings.ts') {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => request.startsWith('.')
    ? loadBookings(resolve(dirname(filename), `${request}.ts`))
    : require(request), loaded, loaded.exports);
  return loaded.exports;
}

const { transition, redactAddress, initialBookingStatus } = loadBookings();

describe('marketplace booking lifecycle', () => {
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
    expect(state.availability['location-a'].availableSlots).toEqual([]);
    expect(state.bookingRequests['booking-a']).toMatchObject({
      ownerId: 'location-a', ownerType: 'salon', clientId: 'client-a', status: 'confirmed',
    });
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
});
