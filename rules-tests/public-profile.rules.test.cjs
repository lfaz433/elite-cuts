const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('node:fs');
const { collection, doc, getDoc, getDocs, query, setDoc, where } = require('firebase/firestore');

const PROJECT_ID = 'demo-elite-cuts-public-profiles';
const RULES = readFileSync('./firestore.rules', 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function anonymousDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedPublicDiscovery() {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'cityLaunches', 'fr-paris'), { status: 'enabled' }),
      setDoc(doc(db, 'cityLaunches', 'fr-grenoble'), { status: 'disabled' }),
      setDoc(doc(db, 'publicProfiles', 'approved-paris'), {
        kind: 'salon',
        cityId: 'fr-paris',
        latitude: 48.8566,
        longitude: 2.3522,
        serviceSummary: 'Coupe et barbe',
        portfolioUrls: ['https://example.test/paris.jpg'],
        visible: true,
        approvalStatus: 'approved',
        displayName: 'Atelier Paris',
        serviceIds: ['cut', 'beard'],
        homeVisit: false,
      }),
      setDoc(doc(db, 'publicProfiles', 'unapproved-paris'), {
        kind: 'salon',
        cityId: 'fr-paris',
        latitude: 48.8566,
        longitude: 2.3522,
        serviceSummary: 'Coupe et barbe',
        portfolioUrls: [],
        visible: true,
        approvalStatus: 'pending',
        displayName: 'Paris non approuvé',
        serviceIds: [],
        homeVisit: false,
      }),
      setDoc(doc(db, 'publicProfiles', 'approved-disabled-city'), {
        kind: 'salon',
        cityId: 'fr-grenoble',
        latitude: 45.1885,
        longitude: 5.7245,
        serviceSummary: 'Coupe classique',
        portfolioUrls: [],
        visible: true,
        approvalStatus: 'approved',
        displayName: 'Grenoble fermé',
        serviceIds: [],
        homeVisit: false,
      }),
      setDoc(doc(db, 'salonLocations', 'private-paris'), {
        name: 'Private Paris Salon',
        address: '17 rue privée',
        city: 'Paris',
        countryCode: 'FR',
      }),
    ]);
  });
}

test('anonymous visitors can read an approved visible profile in an enabled city', async () => {
  await seedPublicDiscovery();

  await assertSucceeds(getDoc(doc(anonymousDb(), 'publicProfiles', 'approved-paris')));
});

test('anonymous discovery lists only cities with an enabled launch record', async () => {
  await seedPublicDiscovery();
  const db = anonymousDb();

  await assertSucceeds(getDoc(doc(db, 'cityLaunches', 'fr-paris')));
  await assertFails(getDoc(doc(db, 'cityLaunches', 'fr-grenoble')));
});

test('anonymous discovery can list visible profiles in its enabled city', async () => {
  await seedPublicDiscovery();

  await assertSucceeds(getDocs(query(
    collection(anonymousDb(), 'publicProfiles'),
    where('cityId', '==', 'fr-paris'),
    where('visible', '==', true),
  )));
});

test('anonymous visitors cannot read an unapproved profile or a disabled city profile', async () => {
  await seedPublicDiscovery();
  const db = anonymousDb();

  await assertFails(getDoc(doc(db, 'publicProfiles', 'unapproved-paris')));
  await assertFails(getDoc(doc(db, 'publicProfiles', 'approved-disabled-city')));
});

test('anonymous profile lists reject a malformed projection with private data', async () => {
  await seedPublicDiscovery();
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'publicProfiles', 'unsafe-paris'), {
      kind: 'salon',
      cityId: 'fr-paris',
      latitude: 48.85,
      longitude: 2.35,
      serviceSummary: 'Coupe et barbe',
      portfolioUrls: [],
      visible: true,
      approvalStatus: 'approved',
      displayName: 'Unsafe Paris',
      serviceIds: [],
      homeVisit: false,
      address: '17 rue privée',
    });
  });
  const db = anonymousDb();

  await assertFails(getDoc(doc(db, 'publicProfiles', 'unsafe-paris')));
  await assertFails(getDocs(query(
    collection(db, 'publicProfiles'),
    where('cityId', '==', 'fr-paris'),
    where('visible', '==', true),
    where('approvalStatus', '==', 'approved'),
  )));
});

test('anonymous visitors cannot read a source location with its exact address', async () => {
  await seedPublicDiscovery();

  await assertFails(getDoc(doc(anonymousDb(), 'salonLocations', 'private-paris')));
});

test('browsers cannot create public profile projections', async () => {
  await seedPublicDiscovery();

  await assertFails(setDoc(doc(anonymousDb(), 'publicProfiles', 'forged'), {
    kind: 'salon',
    cityId: 'fr-paris',
    latitude: 48.8566,
    longitude: 2.3522,
    serviceSummary: 'Forged listing',
    portfolioUrls: [],
    visible: true,
  }));
});
