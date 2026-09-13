const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'demo-elite-cuts-booking-concurrency';
let app;
let db;
let createBooking;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  app = admin.initializeApp({ projectId: PROJECT_ID }, `booking-create-${Date.now()}`);
  db = admin.firestore(app);
  ({ createBooking } = require('../functions/lib/bookingCreate.js'));
});

afterAll(async () => {
  await Promise.all([
    clearCollection('tenants'),
    clearCollection('services'),
    clearCollection('barbers'),
    clearCollection('bookings'),
    clearCollection('booking_slot_locks'),
  ]);
  await app.delete();
});

async function clearCollection(name) {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map(document => document.ref.delete()));
}

test('simultaneous requests cannot commit overlapping bookings for one barber and day', async () => {
  const tenantId = 'tenant-concurrency';
  await Promise.all([
    db.collection('tenants').doc(tenantId).set({
      settings: { allowOnlineBooking: true },
      timezone: 'Europe/Paris',
    }),
    db.collection('services').doc('service-a').set({
      tenantId,
      duration: 30,
      price: 40,
    }),
    db.collection('barbers').doc('barber-a').set({
      tenantId,
      workingDays: [6],
      shiftStart: '09:00',
      shiftEnd: '18:00',
    }),
    db.collection('tenants').doc(tenantId).collection('businessInfo').doc('info').set({
      timezone: 'Europe/Paris',
      weeklyHours: {
        saturday: { isOpen: true, open: '09:00', close: '18:00' },
      },
    }),
  ]);

  const request = {
    clientName: 'Concurrent Client',
    clientEmail: 'client@example.test',
    clientPhone: '+33123456789',
    serviceId: 'service-a',
    barberId: 'barber-a',
    date: '2099-09-05',
    time: '10:30',
    type: 'avec-rdv',
  };
  const results = await Promise.allSettled([
    createBooking(tenantId, 'client-a', request, db),
    createBooking(tenantId, 'client-b', request, db),
  ]);

  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected').reason.message)
    .toBe('Booking slot is no longer available');
  const bookings = await db.collection('bookings').get();
  expect(bookings.size).toBe(1);
  expect(bookings.docs[0].data()).toMatchObject({ isTest: false });
  const lock = await db.collection('booking_slot_locks')
    .doc(`${tenantId}__barber-a__2099-09-05`)
    .get();
  expect(lock.data()).toMatchObject({
    tenantId,
    barberId: 'barber-a',
    date: '2099-09-05',
  });
});
