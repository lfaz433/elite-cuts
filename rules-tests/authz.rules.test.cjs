const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-elite-cuts-authz';
const RULES = readFileSync('./firestore.rules', 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: RULES,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function asUser(uid) {
  return testEnv.authenticatedContext(uid, { sub: uid }).firestore();
}

async function seedMembership(id, userId, overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'memberships', id), {
      userId,
      brandId: 'brand-a',
      locationId: 'location-a',
      role: 'salon_admin',
      status: 'active',
      permissions: { manageStaff: false, manageBookings: true },
      ...overrides,
    });
  });
}

test('an account owner can create only a safe base profile', async () => {
  const db = asUser('client-a');

  await assertSucceeds(setDoc(doc(db, 'users', 'client-a'), {
    uid: 'client-a',
    email: 'client-a@example.test',
    name: 'Client A',
    phone: '+33000000000',
  }));

  await assertFails(setDoc(doc(db, 'users', 'client-b'), {
    uid: 'client-b',
    email: 'client-b@example.test',
    name: 'Client B',
    role: 'superadmin',
    tenantId: 'other',
  }));
});

test('an account owner cannot grant authority through profile fields', async () => {
  const db = asUser('client-a');

  await assertFails(setDoc(doc(db, 'users', 'client-a'), {
    uid: 'client-a',
    email: 'client-a@example.test',
    name: 'Client A',
    role: 'superadmin',
    tenantId: 'other',
  }));
});

test('a member can query their server-created active memberships', async () => {
  await seedMembership('member-a', 'client-a');
  await seedMembership('member-b', 'client-b');
  const db = asUser('client-a');

  const snapshot = await assertSucceeds(getDocs(query(
    collection(db, 'memberships'),
    where('userId', '==', 'client-a'),
    where('status', '==', 'active'),
  )));

  expect(snapshot.docs.map((membership) => membership.id)).toEqual(['member-a']);
});

test('a member cannot change server-owned permissions', async () => {
  await seedMembership('member-b', 'client-b');
  const db = asUser('client-b');

  await assertFails(updateDoc(doc(db, 'memberships', 'member-b'), {
    permissions: { manageStaff: true },
  }));
});

test('a member cannot create a membership or read another users membership', async () => {
  await seedMembership('member-b', 'client-b');
  const db = asUser('client-a');

  await assertFails(setDoc(doc(db, 'memberships', 'forged-member'), {
    userId: 'client-a',
    brandId: 'brand-a',
    locationId: 'location-a',
    role: 'principal_admin',
    status: 'active',
    permissions: { manageStaff: true },
  }));

  await assertFails(getDocs(query(
    collection(db, 'memberships'),
    where('userId', '==', 'client-b'),
    where('status', '==', 'active'),
  )));
});

test('client receives a server-issued notification addressed to their uid without membership', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notifications', 'client-notification'), {
      tenantId: 'location-a',
      locationId: 'location-a',
      recipientId: 'client-a',
      serverIssued: true,
      title: 'Confirmed',
      message: 'Your booking is confirmed',
      read: false,
    });
  });
  const db = asUser('client-a');

  const snapshot = await assertSucceeds(getDocs(query(
    collection(db, 'notifications'),
    where('recipientId', '==', 'client-a'),
    where('tenantId', '==', 'location-a'),
  )));
  expect(snapshot.docs.map(document => document.id)).toEqual(['client-notification']);
});
