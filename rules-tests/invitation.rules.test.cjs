const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'demo-elite-cuts-worker-invitations';
const RULES = readFileSync('./firestore.rules', 'utf8');

let testEnv;
let adminApp;
let adminDb;
let createWorkerInvitation;
let respondToInvitation;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  adminApp = admin.apps.length > 0
    ? admin.app()
    : admin.initializeApp({ projectId: PROJECT_ID });
  adminDb = admin.firestore(adminApp);
  ({ createWorkerInvitation, respondToInvitation } = require('../functions/lib/invitations.js'));
});

afterAll(async () => {
  await testEnv.cleanup();
  await adminApp.delete();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function asUser(uid, email) {
  return testEnv.authenticatedContext(uid, { sub: uid, email }).firestore();
}

async function seedLocation({ inviteWorkers }) {
  await Promise.all([
    adminDb.collection('brands').doc('brand-france').set({
      name: 'Elite Cuts France',
      ownerUid: 'principal-admin',
    }),
    adminDb.collection('salonLocations').doc('paris').set({
      brandId: 'brand-france',
      name: 'Paris',
      city: 'Paris',
      countryCode: 'FR',
    }),
    adminDb.collection('memberships').doc('brand-france__paris__salon-admin').set({
      userId: 'salon-admin',
      brandId: 'brand-france',
      locationId: 'paris',
      role: 'salon_admin',
      status: 'active',
      permissions: {
        manageBookings: true,
        manageStaff: true,
        inviteWorkers,
        removeWorkers: false,
        manageServices: true,
        manageInventory: false,
        manageJobs: true,
      },
    }),
  ]);
}

test('a location administrator without inviteWorkers cannot create an invitation', async () => {
  await seedLocation({ inviteWorkers: false });

  await expect(createWorkerInvitation('salon-admin', {
    locationId: 'paris',
    email: 'worker@example.com',
    displayName: 'Invited Worker',
    role: 'worker',
  }, adminDb)).rejects.toMatchObject({ code: 'permission-denied' });
});

test('an invitation cannot be accepted by a different email account', async () => {
  await seedLocation({ inviteWorkers: true });
  const created = await createWorkerInvitation('salon-admin', {
    locationId: 'paris',
    email: 'worker@example.com',
    displayName: 'Invited Worker',
    role: 'worker',
  }, adminDb);

  await expect(respondToInvitation({
    uid: 'different-account',
    email: 'different@example.com',
  }, {
    invitationId: created.invitationId,
    accept: true,
  }, adminDb)).rejects.toMatchObject({ code: 'permission-denied' });

  const unchanged = await adminDb.collection('invitations').doc(created.invitationId).get();
  expect(unchanged.data()).toMatchObject({ status: 'pending' });
});

test('the invited account activates its own membership only after acceptance', async () => {
  await seedLocation({ inviteWorkers: true });
  const created = await createWorkerInvitation('salon-admin', {
    locationId: 'paris',
    email: 'Worker@Example.com',
    displayName: 'Invited Worker',
    role: 'worker',
  }, adminDb);

  const pending = await adminDb.collection('invitations').doc(created.invitationId).get();
  const membershipsBeforeAcceptance = await adminDb.collection('memberships')
    .where('userId', '==', 'worker-account')
    .get();
  expect(pending.data()).toMatchObject({
    brandId: 'brand-france',
    locationId: 'paris',
    email: 'worker@example.com',
    displayName: 'Invited Worker',
    role: 'worker',
    status: 'pending',
    invitedBy: 'salon-admin',
  });
  expect(membershipsBeforeAcceptance.empty).toBe(true);

  const response = await respondToInvitation({
    uid: 'worker-account',
    email: 'worker@example.com',
  }, {
    invitationId: created.invitationId,
    accept: true,
  }, adminDb);
  const membership = await adminDb.collection('memberships').doc(response.membershipId).get();
  const acceptedInvitation = await adminDb.collection('invitations').doc(created.invitationId).get();

  expect(response).toEqual({
    membershipId: 'brand-france__paris__worker-account',
    status: 'active',
  });
  expect(membership.data()).toMatchObject({
    userId: 'worker-account',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'worker',
    status: 'active',
    invitationId: created.invitationId,
  });
  expect(acceptedInvitation.data()).toMatchObject({
    status: 'accepted',
    respondedBy: 'worker-account',
  });
});

test('the invited account may decline without creating a membership', async () => {
  await seedLocation({ inviteWorkers: true });
  const created = await createWorkerInvitation('salon-admin', {
    locationId: 'paris',
    email: 'worker@example.com',
    displayName: 'Invited Worker',
    role: 'worker',
  }, adminDb);

  const response = await respondToInvitation({
    uid: 'worker-account',
    email: 'worker@example.com',
  }, {
    invitationId: created.invitationId,
    accept: false,
  }, adminDb);
  const membership = await adminDb.collection('memberships').doc(response.membershipId).get();

  expect(response).toEqual({
    membershipId: 'brand-france__paris__worker-account',
    status: 'declined',
  });
  expect(membership.exists).toBe(false);
});

test('only the matching authenticated account can read an invitation', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invitations', 'invite-worker'), {
      brandId: 'brand-france',
      locationId: 'paris',
      email: 'worker@example.com',
      displayName: 'Invited Worker',
      role: 'worker',
      status: 'pending',
      invitedBy: 'salon-admin',
    });
  });

  await assertSucceeds(getDoc(doc(
    asUser('worker-account', 'worker@example.com'),
    'invitations',
    'invite-worker',
  )));
  await assertFails(getDoc(doc(
    asUser('different-account', 'different@example.com'),
    'invitations',
    'invite-worker',
  )));
});

test('an invited account cannot activate a membership with a browser write', async () => {
  await seedLocation({ inviteWorkers: true });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invitations', 'invite-worker'), {
      brandId: 'brand-france',
      locationId: 'paris',
      email: 'worker@example.com',
      displayName: 'Invited Worker',
      role: 'worker',
      status: 'pending',
      invitedBy: 'salon-admin',
    });
  });
  const invitedAccount = asUser('worker-account', 'worker@example.com');

  await assertFails(updateDoc(doc(invitedAccount, 'invitations', 'invite-worker'), {
    status: 'accepted',
  }));
  await assertFails(setDoc(doc(
    invitedAccount,
    'memberships',
    'brand-france__paris__worker-account',
  ), {
    userId: 'worker-account',
    brandId: 'brand-france',
    locationId: 'paris',
    role: 'worker',
    status: 'active',
    permissions: {},
  }));
});
