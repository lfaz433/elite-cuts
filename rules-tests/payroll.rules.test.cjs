const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const {
  addDoc, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} = require('firebase/firestore');

const RULES = readFileSync('./firestore.rules', 'utf8');
const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

let testEnv;
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-payroll-rules',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => testEnv.cleanup());
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants', TENANT), { ownerUid: 'owner-a', subdomain: TENANT });
    await setDoc(doc(db, 'tenants', OTHER_TENANT), { ownerUid: 'owner-b', subdomain: OTHER_TENANT });
    await setDoc(doc(db, 'memberships', `${TENANT}__worker-a`), {
      userId: 'worker-a', locationId: TENANT, brandId: TENANT, role: 'worker',
      status: 'active', barberId: 'barber-a', permissions: {},
    });
    await setDoc(doc(db, 'memberships', `${TENANT}__worker-paused`), {
      userId: 'worker-paused', locationId: TENANT, brandId: TENANT, role: 'worker',
      status: 'suspended', barberId: 'barber-p', permissions: {},
    });
    await setDoc(doc(db, 'payroll_requests', 'req-a'), {
      tenantId: TENANT, barberId: 'barber-a', barberName: 'A', amount: 40, status: 'pending', requestedAt: 1,
    });
    await setDoc(doc(db, 'payroll_requests', 'req-b'), {
      tenantId: TENANT, barberId: 'barber-b', barberName: 'B', amount: 90, status: 'pending', requestedAt: 1,
    });
    await setDoc(doc(db, 'payroll_payments', 'pay-a'), {
      tenantId: TENANT, barberId: 'barber-a', barberName: 'A', amount: 40, requestId: 'old', paidAt: 1, paidBy: 'owner-a',
    });
    await setDoc(doc(db, 'payroll_payments', 'pay-b'), {
      tenantId: TENANT, barberId: 'barber-b', barberName: 'B', amount: 90, requestId: 'old', paidAt: 1, paidBy: 'owner-a',
    });
  });
});

const barberDb = () => testEnv.authenticatedContext('worker-a').firestore();
const ownRequest = (overrides = {}) => ({
  tenantId: TENANT, barberId: 'barber-a', barberName: 'A',
  amount: 25, status: 'pending', requestedAt: Date.now(), ...overrides,
});

test('a barber can file a pending payout request for themselves', async () => {
  await assertSucceeds(addDoc(collection(barberDb(), 'payroll_requests'), ownRequest()));
});

test('a barber cannot file a request for another barber, another salon, or pre-approved', async () => {
  const db = barberDb();
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ barberId: 'barber-b' })));
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ tenantId: OTHER_TENANT })));
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ status: 'approved' })));
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ amount: 0 })));
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ amount: '25' })));
  await assertFails(addDoc(collection(db, 'payroll_requests'), ownRequest({ approvedAmount: 25 })));
});

test('a suspended worker or a plain client cannot file a request', async () => {
  const pausedDb = testEnv.authenticatedContext('worker-paused').firestore();
  await assertFails(addDoc(collection(pausedDb, 'payroll_requests'), ownRequest({ barberId: 'barber-p' })));
  const clientDb = testEnv.authenticatedContext('client-a').firestore();
  await assertFails(addDoc(collection(clientDb, 'payroll_requests'), ownRequest()));
});

test('a barber reads only their own requests and payouts', async () => {
  const db = barberDb();
  await assertSucceeds(getDocs(query(collection(db, 'payroll_requests'),
    where('tenantId', '==', TENANT), where('barberId', '==', 'barber-a'))));
  await assertSucceeds(getDocs(query(collection(db, 'payroll_payments'),
    where('tenantId', '==', TENANT), where('barberId', '==', 'barber-a'))));
  await assertSucceeds(getDoc(doc(db, 'payroll_payments', 'pay-a')));
  await assertFails(getDoc(doc(db, 'payroll_payments', 'pay-b')));
  await assertFails(getDoc(doc(db, 'payroll_requests', 'req-b')));
  await assertFails(getDocs(query(collection(db, 'payroll_payments'), where('tenantId', '==', TENANT))));
});

test('a barber cannot approve their own request or create a payout', async () => {
  const db = barberDb();
  await assertFails(updateDoc(doc(db, 'payroll_requests', 'req-a'), { status: 'approved' }));
  await assertFails(addDoc(collection(db, 'payroll_payments'), {
    tenantId: TENANT, barberId: 'barber-a', amount: 1000, requestId: 'req-a', paidAt: 1, paidBy: 'worker-a',
  }));
});

test('the owner still reads all payroll and approves requests', async () => {
  const db = testEnv.authenticatedContext('owner-a').firestore();
  await assertSucceeds(getDocs(query(collection(db, 'payroll_requests'), where('tenantId', '==', TENANT))));
  await assertSucceeds(getDocs(query(collection(db, 'payroll_payments'), where('tenantId', '==', TENANT))));
  await assertSucceeds(updateDoc(doc(db, 'payroll_requests', 'req-a'), { status: 'approved', approvedAmount: 40 }));
});

const adminNotice = (overrides = {}) => ({
  tenantId: TENANT, recipientId: 'admin', senderBarberId: 'barber-a',
  title: 'Nouvelle demande de paiement', message: 'A demande 25', type: 'payroll',
  createdAt: new Date().toISOString(), read: false, ...overrides,
});

test('a barber can notify the admins about their own payout request', async () => {
  await assertSucceeds(addDoc(collection(barberDb(), 'notifications'), adminNotice()));
});

test('a barber cannot spoof admin notices', async () => {
  const db = barberDb();
  await assertFails(addDoc(collection(db, 'notifications'), adminNotice({ senderBarberId: 'barber-b' })));
  await assertFails(addDoc(collection(db, 'notifications'), adminNotice({ type: 'booking' })));
  await assertFails(addDoc(collection(db, 'notifications'), adminNotice({ tenantId: OTHER_TENANT })));
  await assertFails(addDoc(collection(db, 'notifications'), adminNotice({ serverIssued: true })));
  await assertFails(addDoc(collection(db, 'notifications'), adminNotice({ link: 'https://evil.example' })));
  const clientDb = testEnv.authenticatedContext('client-a').firestore();
  await assertFails(addDoc(collection(clientDb, 'notifications'), adminNotice()));
});

test('a barber still cannot read the admin inbox', async () => {
  await assertFails(getDocs(query(collection(barberDb(), 'notifications'),
    where('recipientId', '==', 'admin'), where('tenantId', '==', TENANT))));
});
