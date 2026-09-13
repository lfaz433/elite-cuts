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
      bookings: [expect.objectContaining({ id: 'booking-a', clientId: 'client-a' })],
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
