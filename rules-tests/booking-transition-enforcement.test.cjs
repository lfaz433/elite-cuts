const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('node:fs');
const { addDoc, collection, doc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-elite-cuts-booking-transition';
const RULES = readFileSync('./firestore.rules', 'utf8');
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => testEnv.cleanup());
beforeEach(async () => testEnv.clearFirestore());

async function seedBooking() {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'bookings', 'booking-a'), {
      tenantId: 'tenant-a',
      locationId: 'tenant-a',
      status: 'pending',
      clientName: 'Client',
    });
  });
}

test('a tenant member cannot bypass the transition endpoint with a direct status write', async () => {
  await seedBooking();
  const db = testEnv.authenticatedContext('manager-a', {
    sub: 'manager-a',
    tenantId: 'tenant-a',
  }).firestore();

  await assertFails(updateDoc(doc(db, 'bookings', 'booking-a'), {
    status: 'completed',
  }));
});

test('a tenant member may still update a non-transition booking field', async () => {
  await seedBooking();
  const db = testEnv.authenticatedContext('manager-a', {
    sub: 'manager-a',
    tenantId: 'tenant-a',
  }).firestore();

  await assertSucceeds(updateDoc(doc(db, 'bookings', 'booking-a'), {
    unreadAdmin: false,
  }));
});

test('a tenant member cannot move a booking to another tenant or location', async () => {
  await seedBooking();
  const db = testEnv.authenticatedContext('manager-a', {
    sub: 'manager-a',
    tenantId: 'tenant-a',
  }).firestore();

  await assertFails(updateDoc(doc(db, 'bookings', 'booking-a'), {
    tenantId: 'tenant-b',
    locationId: 'tenant-b',
  }));
});

test('a client cannot forge a server-issued push notification', async () => {
  const db = testEnv.authenticatedContext('manager-a', {
    sub: 'manager-a',
    tenantId: 'tenant-a',
  }).firestore();

  await assertFails(addDoc(collection(db, 'notifications'), {
    serverIssued: true,
    tenantId: 'tenant-a',
    recipientId: 'victim',
    title: 'Forged title',
    message: 'Forged content',
    redirectUrl: '/client',
  }));
});

test('a client cannot promote its own notification into a server-issued push target', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'notifications', 'client-notification'), {
      tenantId: 'tenant-a',
      recipientId: 'manager-a',
      title: 'Client title',
      message: 'Client content',
    });
  });
  const db = testEnv.authenticatedContext('manager-a', {
    sub: 'manager-a',
    tenantId: 'tenant-a',
  }).firestore();

  await assertFails(updateDoc(doc(db, 'notifications', 'client-notification'), {
    serverIssued: true,
  }));
});
