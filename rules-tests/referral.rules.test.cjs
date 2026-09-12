const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  assertFails,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');

const rules = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-referral-rules',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

test('authenticated clients cannot write server-owned referral records', async () => {
  const authedDb = testEnv.authenticatedContext('client-a').firestore();

  await assertFails(setDoc(doc(authedDb, 'referralPrograms', 'program-a'), { status: 'active' }));
  await assertFails(setDoc(doc(authedDb, 'referralCodes', 'PARIS-5'), { ownerId: 'client-a' }));
  await assertFails(setDoc(doc(authedDb, 'referralAttributions', 'client-a'), { code: 'PARIS-5' }));
  await assertFails(setDoc(doc(authedDb, 'referralRewards', 'reward-a'), { status: 'approved' }));
  await assertFails(setDoc(doc(authedDb, 'creditLedgers', 'ledger-a'), { amountMinor: 500 }));
});
