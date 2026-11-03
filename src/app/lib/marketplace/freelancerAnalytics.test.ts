import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketplaceBooking } from './bookingRecords.ts';
import { calculateFreelancerAnalytics } from './freelancerAnalytics.ts';

const now = new Date('2099-09-01T10:00:00');

function booking(patch: Partial<MarketplaceBooking> = {}): MarketplaceBooking {
  return {
    id: 'booking-a', source: 'marketplace', profileId: 'freelancer__freelancer-a',
    ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a', clientName: 'Ada',
    serviceId: 'cut', date: '2099-09-02', time: '10:00', status: 'confirmed',
    appointmentMode: 'home', guestBooking: false, totalPriceMinor: 2500,
    ...patch,
  };
}

test('forecasts confirmed and completed appointments only with unique clients and breakdowns', () => {
  const bookings = [
    booking(),
    booking({ id: 'booking-b', clientId: 'client-b', serviceId: 'beard', appointmentMode: 'chair', status: 'completed', totalPriceMinor: 5000 }),
    booking({ id: 'cancelled', clientId: 'client-c', status: 'cancelled', totalPriceMinor: 9000 }),
    ...(['pending_approval', 'declined', 'payment_failed'] as const).map(status => booking({ id: status, clientId: status, status, totalPriceMinor: 10000 })),
  ];
  assert.deepEqual(calculateFreelancerAnalytics(bookings, '30d', now), {
    forecastMinor: 7500, confirmedCount: 2, uniqueClientCount: 2, cancelledCount: 1,
    byService: [
      { serviceId: 'beard', forecastMinor: 5000, count: 1 },
      { serviceId: 'cut', forecastMinor: 2500, count: 1 },
    ],
    byMode: [
      { mode: 'home', forecastMinor: 2500, count: 1 },
      { mode: 'chair', forecastMinor: 5000, count: 1 },
    ],
  });
});

test('uses appointment date and time in an inclusive forward 7 or 30 day window', () => {
  const bookings = [
    booking({ id: 'past', date: '2099-09-01', time: '09:59', totalPriceMinor: 100 }),
    booking({ id: 'start', date: '2099-09-01', time: '10:00', totalPriceMinor: 200 }),
    booking({ id: 'end7', date: '2099-09-08', time: '10:00', totalPriceMinor: 300 }),
    booking({ id: 'after7', date: '2099-09-08', time: '10:01', totalPriceMinor: 400 }),
    booking({ id: 'end30', date: '2099-10-01', time: '10:00', totalPriceMinor: 500 }),
    booking({ id: 'after30', date: '2099-10-01', time: '10:01', totalPriceMinor: 600 }),
    booking({ id: 'past-cancelled', date: '2099-08-31', status: 'cancelled' }),
    booking({ id: 'future-cancelled', date: '2099-09-09', status: 'cancelled' }),
  ];
  const seven = calculateFreelancerAnalytics(bookings, '7d', now);
  assert.equal(seven.forecastMinor, 500);
  assert.equal(seven.confirmedCount, 2);
  assert.equal(seven.cancelledCount, 0);
  const thirty = calculateFreelancerAnalytics(bookings, '30d', now);
  assert.equal(thirty.forecastMinor, 1400);
  assert.equal(thirty.confirmedCount, 4);
  assert.equal(thirty.cancelledCount, 1);
  assert.equal(thirty.uniqueClientCount, 1);
});

test('counts unpriced confirmed bookings without inventing revenue and does not mutate input', () => {
  const bookings = [booking({ totalPriceMinor: undefined }), booking({ id: 'second', totalPriceMinor: 500 })];
  const before = structuredClone(bookings);
  const result = calculateFreelancerAnalytics(bookings, '7d', now);
  assert.equal(result.forecastMinor, 500);
  assert.equal(result.confirmedCount, 2);
  assert.equal(result.uniqueClientCount, 1);
  assert.deepEqual(result.byService, [{ serviceId: 'cut', forecastMinor: 500, count: 2 }]);
  assert.deepEqual(bookings, before);
});

test('ignores malformed appointment dates instead of rolling them into the forecast', () => {
  const result = calculateFreelancerAnalytics([
    booking({ date: 'invalid' }), booking({ date: '2099-09-31' }),
    booking({ time: '24:00' }), booking({ date: '2099-09-02', time: 'bad' }),
  ], '30d', now);
  assert.deepEqual(result, {
    forecastMinor: 0, confirmedCount: 0, uniqueClientCount: 0, cancelledCount: 0,
    byService: [], byMode: [],
  });
});

test('returns an empty forecast for an empty booking list', () => {
  assert.deepEqual(calculateFreelancerAnalytics([], '7d', now), {
    forecastMinor: 0, confirmedCount: 0, uniqueClientCount: 0, cancelledCount: 0,
    byService: [], byMode: [],
  });
});
