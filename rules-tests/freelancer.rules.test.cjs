const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('node:fs');
const { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } = require('firebase/firestore');

const PROJECT_ID = 'demo-elite-cuts-freelancers';
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
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'freelancerProfiles', 'freelancer-a'), {
        uid: 'freelancer-a', cityId: 'fr-paris', visible: true, radiusKm: 10,
      }),
      setDoc(doc(db, 'portfolioItems', 'portfolio-a'), {
        ownerId: 'freelancer-a', ownerType: 'freelancer', imageUrl: 'https://example.test/a.jpg',
      }),
      setDoc(doc(db, 'availability', 'freelancer-a'), {
        ownerId: 'freelancer-a', availableSlots: ['2099-09-07T10:00'],
      }),
      setDoc(doc(db, 'jobPosts', 'job-paris'), {
        brandId: 'brand-a', locationId: 'location-paris', cityId: 'fr-paris',
        status: 'published', relationshipType: 'employee',
      }),
      setDoc(doc(db, 'jobApplications', 'application-a'), {
        applicantId: 'freelancer-a', brandId: 'brand-a', locationId: 'location-paris',
        cityId: 'fr-paris', relationshipType: 'employee', status: 'submitted',
      }),
      setDoc(doc(db, 'bookingRequests', 'booking-a'), {
        profileId: 'freelancer__freelancer-a', ownerId: 'freelancer-a',
        ownerType: 'freelancer', clientId: 'client-a', serviceId: 'cut',
        date: '2099-09-07', time: '10:00', status: 'pending_approval',
      }),
    ]);
  });
});

function asUser(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

test('a freelancer can read only their own private workspace records', async () => {
  await assertSucceeds(getDoc(doc(asUser('freelancer-a'), 'freelancerProfiles', 'freelancer-a')));
  await assertSucceeds(getDoc(doc(asUser('freelancer-a'), 'portfolioItems', 'portfolio-a')));
  await assertSucceeds(getDoc(doc(asUser('freelancer-a'), 'availability', 'freelancer-a')));
  await assertFails(getDoc(doc(asUser('freelancer-b'), 'freelancerProfiles', 'freelancer-a')));
  await assertFails(getDoc(doc(asUser('freelancer-b'), 'portfolioItems', 'portfolio-a')));
  await assertFails(getDoc(doc(asUser('freelancer-b'), 'availability', 'freelancer-a')));
});

test('owner dashboards use query constraints that prove the complete rule scope', async () => {
  const owner = asUser('freelancer-a');
  await assertSucceeds(getDocs(query(
    collection(owner, 'portfolioItems'),
    where('ownerId', '==', 'freelancer-a'),
    where('ownerType', '==', 'freelancer'),
  )));
  await assertFails(getDocs(query(
    collection(owner, 'portfolioItems'),
    where('ownerId', '==', 'freelancer-a'),
  )));
  await assertSucceeds(getDocs(query(
    collection(owner, 'bookingRequests'),
    where('ownerId', '==', 'freelancer-a'),
    where('ownerType', '==', 'freelancer'),
  )));
  await assertFails(getDocs(query(
    collection(owner, 'bookingRequests'),
    where('ownerId', '==', 'freelancer-a'),
  )));
});

test('browser clients cannot bypass server validation for freelancer records', async () => {
  const owner = asUser('freelancer-a');
  await assertFails(updateDoc(doc(owner, 'freelancerProfiles', 'freelancer-a'), { visible: false }));
  await assertFails(setDoc(doc(owner, 'portfolioItems', 'forged'), {
    ownerId: 'freelancer-a', ownerType: 'freelancer', imageUrl: 'javascript:alert(1)',
  }));
  await assertFails(updateDoc(doc(owner, 'availability', 'freelancer-a'), {
    availableSlots: ['2099-09-07T12:00'],
  }));
});

test('jobs and applications cannot be read or written around scoped callables', async () => {
  const freelancer = asUser('freelancer-a');
  await assertFails(getDoc(doc(freelancer, 'jobPosts', 'job-paris')));
  await assertFails(getDoc(doc(freelancer, 'jobApplications', 'application-a')));
  await assertFails(setDoc(doc(freelancer, 'jobApplications', 'forged'), {
    applicantId: 'freelancer-a', locationId: 'other-location', cityId: 'fr-grenoble',
    relationshipType: 'employee', status: 'accepted',
  }));
});
