import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientBookingScope,
  parseLegacyClientBooking,
  parseMarketplaceBooking,
  parseSalonBookingWorkspace,
} from './bookingRecords.ts';

test('uses the mandatory clientId constraint for both booking collections', () => {
  assert.deepEqual(clientBookingScope('client-a'), [['clientId', '==', 'client-a']]);
});

test('parses marketplace and legacy client bookings without crossing client scope', () => {
  assert.deepEqual(parseMarketplaceBooking('request-a', 'client-a', {
    profileId: 'freelancer__freelancer-a', ownerId: 'freelancer-a', ownerType: 'freelancer',
    clientId: 'client-a', clientName: 'Ada', serviceId: 'cut', date: '2099-09-05', time: '10:30',
    status: 'confirmed', totalPriceMinor: 3300, travelFeeMinor: 800, cancellationWindowHours: 24,
    serviceRadiusKm: 12, distanceKm: 0.8,
  }), {
    id: 'request-a', source: 'marketplace', profileId: 'freelancer__freelancer-a',
    appointmentMode: 'home', guestBooking: false,
    ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', clientName: 'Ada',
    serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'confirmed',
    totalPriceMinor: 3300, travelFeeMinor: 800, cancellationWindowHours: 24,
    serviceRadiusKm: 12, distanceKm: 0.8,
  });
  assert.equal(parseMarketplaceBooking('request-a', 'client-b', {
    clientId: 'client-a', status: 'confirmed',
  }), null);

  assert.deepEqual(parseLegacyClientBooking('legacy-a', 'client-a', {
    tenantId: 'tenant-a', locationId: 'location-a', clientId: 'client-a', clientName: 'Ada',
    serviceId: 'cut', date: '2099-09-04', time: '09:00', status: 'approved',
  }), {
    id: 'legacy-a', source: 'legacy', profileId: 'salon__location-a', ownerId: 'location-a',
    ownerType: 'salon', clientId: 'client-a', clientName: 'Ada', serviceId: 'cut',
    date: '2099-09-04', time: '09:00', status: 'confirmed',
    appointmentMode: 'home', guestBooking: false,
  });
  assert.equal(parseLegacyClientBooking('legacy-a', 'client-b', {
    locationId: 'location-a', clientId: 'client-a', status: 'approved',
  }), null);
});

test('parses only exact-location salon booking workspace records', () => {
  const validBooking = {
    id: 'booking-a', profileId: 'salon__location-a', ownerId: 'location-a', ownerType: 'salon',
    clientId: 'client-a', clientName: 'Ada', serviceId: 'cut', date: '2099-09-05', time: '10:30',
    status: 'pending_approval',
  };
  assert.deepEqual(parseSalonBookingWorkspace({
    locationId: 'location-a',
    configuredSlots: ['2099-09-05T10:30', '2099-09-05T11:30'],
    availableSlots: ['2099-09-05T11:30'],
    bookings: [validBooking, { ...validBooking, id: 'booking-cross', ownerId: 'location-b' }],
  }, 'location-a'), {
    locationId: 'location-a',
    configuredSlots: ['2099-09-05T10:30', '2099-09-05T11:30'],
    availableSlots: ['2099-09-05T11:30'],
    bookings: [
      { ...validBooking, source: 'marketplace', appointmentMode: 'home', guestBooking: false },
    ],
  });
  assert.equal(parseSalonBookingWorkspace({
    locationId: 'location-a', availableSlots: [], bookings: [],
  }, 'location-a'), null);
  assert.equal(parseSalonBookingWorkspace({ locationId: 'location-b' }, 'location-a'), null);
});

const legacyBooking = {
  profileId: 'freelancer__freelancer-a', ownerId: 'freelancer-a', ownerType: 'freelancer',
  clientId: 'client-a', clientName: 'Ada', serviceId: 'cut', date: '2099-09-05', time: '10:30',
  status: 'confirmed', totalPriceMinor: 3300,
};
const workplaceSnapshot = { name: 'Atelier', line1: '1 rue de Paris', postalCode: '75001', city: 'Paris' };

test('reads a legacy freelancer booking as a non-guest home appointment', () => {
  const booking = parseMarketplaceBooking('booking-a', null, legacyBooking);
  assert.equal(booking?.appointmentMode, 'home');
  assert.equal(booking?.guestBooking, false);
});

test('retains a chair appointment workplace snapshot and guest flag', () => {
  const booking = parseMarketplaceBooking('booking-a', null, {
    ...legacyBooking, appointmentMode: 'chair', guestBooking: true, workplaceSnapshot,
  });
  assert.equal(booking?.appointmentMode, 'chair');
  assert.equal(booking?.guestBooking, true);
  assert.deepEqual(booking?.workplaceSnapshot, workplaceSnapshot);
});

test('rejects a chair booking with a missing or incomplete workplace snapshot', () => {
  for (const snapshot of [undefined, null, {}, { ...workplaceSnapshot, line1: ' ' },
    { ...workplaceSnapshot, city: 42 }]) {
    assert.equal(parseMarketplaceBooking('booking-a', null, {
      ...legacyBooking, appointmentMode: 'chair', workplaceSnapshot: snapshot,
    }), null);
  }
});

test('rejects workplace snapshots on home bookings including defaulted legacy home mode', () => {
  for (const appointmentMode of [undefined, 'home']) {
    for (const snapshot of [workplaceSnapshot, null]) {
      assert.equal(parseMarketplaceBooking('booking-a', null, {
        ...legacyBooking, appointmentMode, workplaceSnapshot: snapshot,
      }), null);
    }
  }
});

test('rejects unknown appointment modes and non-boolean guest flags', () => {
  for (const patch of [{ appointmentMode: 'salon' }, { appointmentMode: null },
    { guestBooking: 'false' }, { guestBooking: null }]) {
    assert.equal(parseMarketplaceBooking('booking-a', null, { ...legacyBooking, ...patch }), null);
  }
});
