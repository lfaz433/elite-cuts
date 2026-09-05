const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'demo-elite-cuts-marketplace-memberships';
const RULES = readFileSync('./firestore.rules', 'utf8');

let testEnv;
let adminApp;
let adminDb;
let bootstrapBrandOwner;
let createSalonLocation;
let locationMembershipId;

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
  ({ bootstrapBrandOwner, createSalonLocation, locationMembershipId } = require('../functions/lib/memberships.js'));
});

afterAll(async () => {
  await testEnv.cleanup();
  await adminApp.delete();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function asUser(uid) {
  return testEnv.authenticatedContext(uid, { sub: uid }).firestore();
}

async function seedMarketplace() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'brands', 'brand-france'), {
        name: 'Elite Cuts France',
        ownerUid: 'principal-admin',
      }),
      setDoc(doc(db, 'salonLocations', 'paris'), {
        brandId: 'brand-france', name: 'Paris', city: 'Paris', countryCode: 'FR',
      }),
      setDoc(doc(db, 'salonLocations', 'grenoble'), {
        brandId: 'brand-france', name: 'Grenoble', city: 'Grenoble', countryCode: 'FR',
      }),
      setDoc(doc(db, 'memberships', 'brand-france__principal__principal-admin'), {
        userId: 'principal-admin',
        brandId: 'brand-france',
        role: 'principal_admin',
        status: 'active',
        permissions: { manageBookings: true, manageStaff: true, inviteWorkers: true, removeWorkers: true, manageServices: true, manageInventory: true, manageJobs: true },
      }),
      setDoc(doc(db, 'memberships', 'brand-france__paris__paris-admin'), {
        userId: 'paris-admin',
        brandId: 'brand-france',
        locationId: 'paris',
        role: 'salon_admin',
        status: 'active',
        permissions: { manageBookings: true, manageStaff: true, inviteWorkers: false, removeWorkers: false, manageServices: true, manageInventory: false, manageJobs: true },
      }),
    ]);
  });
}

test('a Principal Admin can read every location in their brand', async () => {
  await seedMarketplace();
  const asPrincipalAdmin = asUser('principal-admin');

  await assertSucceeds(getDoc(doc(asPrincipalAdmin, 'salonLocations', 'grenoble')));
});

test('a Salon Admin cannot access an unassigned location', async () => {
  await seedMarketplace();
  const asParisAdmin = asUser('paris-admin');

  await assertSucceeds(getDoc(doc(asParisAdmin, 'salonLocations', 'paris')));
  await assertFails(getDoc(doc(asParisAdmin, 'salonLocations', 'grenoble')));
});

test('a Salon Admin cannot promote their own membership', async () => {
  await seedMarketplace();
  const ownMembership = 'brand-france__paris__paris-admin';
  const asSalonAdmin = asUser('paris-admin');

  await assertFails(updateDoc(doc(asSalonAdmin, 'memberships', ownMembership), {
    role: 'principal_admin',
  }));
});

test('a Principal Admin can read memberships for their brand', async () => {
  await seedMarketplace();
  const asPrincipalAdmin = asUser('principal-admin');

  await assertSucceeds(getDoc(doc(
    asPrincipalAdmin,
    'memberships',
    'brand-france__paris__paris-admin',
  )));
});

test('a Principal Admin can create a location with a server-owned membership', async () => {
  const bootstrap = await bootstrapBrandOwner('principal-admin', {
    brandName: 'Elite Cuts France',
    locationName: 'Paris',
    city: 'Paris',
    countryCode: 'FR',
  }, adminDb);

  const created = await createSalonLocation('principal-admin', {
    brandId: bootstrap.brandId,
    name: 'Grenoble',
    city: 'Grenoble',
    countryCode: 'FR',
  }, adminDb);
  const membership = await adminDb.collection('memberships').doc(created.membershipId).get();
  const tenantBridge = await adminDb.collection('tenants').doc(created.locationId).get();

  expect(membership.data()).toMatchObject({
    userId: 'principal-admin',
    brandId: bootstrap.brandId,
    locationId: created.locationId,
    role: 'principal_admin',
    status: 'active',
  });
  expect(tenantBridge.data()).toMatchObject({
    brandId: bootstrap.brandId,
    ownerUid: 'principal-admin',
    name: 'Grenoble',
  });
});

test('a Salon Admin cannot create a location', async () => {
  const bootstrap = await bootstrapBrandOwner('principal-admin', {
    brandName: 'Elite Cuts France',
    locationName: 'Paris',
    city: 'Paris',
    countryCode: 'FR',
  }, adminDb);
  await adminDb.collection('memberships').doc(locationMembershipId(
    bootstrap.brandId,
    bootstrap.locationId,
    'salon-admin',
  )).set({
    userId: 'salon-admin',
    brandId: bootstrap.brandId,
    locationId: bootstrap.locationId,
    role: 'salon_admin',
    status: 'active',
    permissions: { manageBookings: true },
  });

  await expect(createSalonLocation('salon-admin', {
    brandId: bootstrap.brandId,
    name: 'Grenoble',
    city: 'Grenoble',
    countryCode: 'FR',
  }, adminDb)).rejects.toMatchObject({ code: 'permission-denied' });
});
