const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const RULES = readFileSync('./firestore.rules', 'utf8');
let testEnv;
beforeAll(async () => { testEnv = await initializeTestEnvironment({ projectId: 'demo-marketplace-booking-privacy', firestore: { rules: RULES, host: '127.0.0.1', port: 8080 } }); });
afterAll(async () => testEnv.cleanup());
beforeEach(async () => testEnv.clearFirestore());

test('a client can save only its own profile favourite', async () => {
  const db = testEnv.authenticatedContext('client-a').firestore();
  await assertSucceeds(setDoc(doc(db, 'clientFavourites', 'client-a', 'items', 'salon__location-a'), { profileId: 'salon__location-a' }));
  await assertFails(setDoc(doc(db, 'clientFavourites', 'client-b', 'items', 'salon__location-a'), { profileId: 'salon__location-a' }));
});

test('browser clients cannot forge or read exact-address booking records', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'bookingRequestPrivate', 'booking-a'), { clientId: 'client-a', address: { line1: '12 rue des Fleurs', city: 'Paris' } });
  });
  const db = testEnv.authenticatedContext('client-a').firestore();
  await assertFails(getDoc(doc(db, 'bookingRequestPrivate', 'booking-a')));
  await assertFails(setDoc(doc(db, 'bookingRequests', 'booking-a'), { clientId: 'client-a', status: 'confirmed' }));
});
