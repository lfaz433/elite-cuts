const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
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

test('public barber documents are readable only when credential fields are absent', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all([
      setDoc(doc(ctx.firestore(), 'barbers', 'safe-barber'), {
        tenantId: 'location-a', name: 'Safe Barber', email: 'safe@example.test', publicCredentialSafe: true,
      }),
      setDoc(doc(ctx.firestore(), 'barbers', 'legacy-password-barber'), {
        tenantId: 'location-a', name: 'Legacy Barber', password: 'plaintext',
      }),
    ]);
  });
  const anonymous = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymous, 'barbers', 'safe-barber')));
  await assertFails(getDoc(doc(anonymous, 'barbers', 'legacy-password-barber')));
});

test('tenant members cannot write credential fields into public barber documents', async () => {
  await seedMembership('location-a__manager-a', 'manager-a', {
    brandId: 'location-a', locationId: 'location-a', role: 'principal_admin',
  });
  const manager = asUser('manager-a');

  await assertFails(setDoc(doc(manager, 'barbers', 'unsafe-barber'), {
    tenantId: 'location-a', name: 'Unsafe Barber', password: 'plaintext',
  }));
  await assertSucceeds(setDoc(doc(manager, 'barbers', 'safe-barber'), {
    tenantId: 'location-a', name: 'Safe Barber', email: 'safe@example.test', publicCredentialSafe: true,
  }));
  await assertFails(setDoc(doc(manager, 'barbers', 'fake-safe-barber'), {
    tenantId: 'location-a', name: 'Unsafe Barber', publicCredentialSafe: true,
    metadata: { password: 'nested-plaintext' },
  }));
  await assertFails(updateDoc(doc(manager, 'barbers', 'safe-barber'), {
    temporaryPassword: 'plaintext',
  }));
});

test('public barber timestamp fields cannot hide nested credential maps', async () => {
  await seedMembership('location-a__manager-a', 'manager-a', {
    brandId: 'location-a', locationId: 'location-a', role: 'principal_admin',
  });
  const manager = asUser('manager-a');

  await assertFails(setDoc(doc(manager, 'barbers', 'unsafe-created-at'), {
    tenantId: 'location-a',
    name: 'Unsafe Barber',
    publicCredentialSafe: true,
    createdAt: { token: 'nested-secret' },
  }));
  await assertFails(setDoc(doc(manager, 'barbers', 'unsafe-updated-at'), {
    tenantId: 'location-a',
    name: 'Unsafe Barber',
    publicCredentialSafe: true,
    updatedAt: { password: 'nested-secret' },
  }));
});

test('a marketplace worker can access only their bridged location tenant operations', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all([
      setDoc(doc(ctx.firestore(), 'tenants', 'location-market'), {
        brandId: 'brand-market', ownerUid: 'principal-a',
      }),
      setDoc(doc(ctx.firestore(), 'tenants', 'location-other'), {
        brandId: 'brand-market', ownerUid: 'principal-a',
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-market__location-market__worker-a'), {
        userId: 'worker-a',
        brandId: 'brand-market',
        locationId: 'location-market',
        role: 'worker',
        status: 'active',
        permissions: {},
      }),
      setDoc(doc(ctx.firestore(), 'bookings', 'market-booking'), {
        tenantId: 'location-market',
        locationId: 'location-market',
        clientId: 'client-a',
        status: 'pending',
      }),
    ]);
  });
  const worker = asUser('worker-a');

  await assertSucceeds(getDoc(doc(worker, 'bookings', 'market-booking')));
  await assertSucceeds(setDoc(doc(worker, 'services', 'market-service'), {
    tenantId: 'location-market', name: 'Cut', price: 25,
  }));
  await assertFails(setDoc(doc(worker, 'services', 'other-service'), {
    tenantId: 'location-other', name: 'Cross-location cut', price: 25,
  }));
});

test('public business info is readable only after a trusted safe marker is present', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all([
      setDoc(doc(ctx.firestore(), 'tenants', 'location-a', 'businessInfo', 'safe'), {
        name: 'Safe Salon',
        publicCredentialSafe: true,
      }),
      setDoc(doc(ctx.firestore(), 'tenants', 'location-a', 'businessInfo', 'legacy'), {
        name: 'Legacy Salon',
        password: 'plaintext',
      }),
    ]);
  });
  const anonymous = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymous, 'tenants', 'location-a', 'businessInfo', 'safe')));
  await assertFails(getDoc(doc(anonymous, 'tenants', 'location-a', 'businessInfo', 'legacy')));
});

test('browser clients cannot create, change, or delete public business info', async () => {
  await seedMembership('location-a__manager-a', 'manager-a', {
    brandId: 'location-a',
    locationId: 'location-a',
    permissions: { manageStaff: true },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants', 'location-a', 'businessInfo', 'info'), {
      name: 'Safe Salon',
      publicCredentialSafe: true,
    });
  });
  const manager = asUser('manager-a');

  await assertFails(setDoc(doc(manager, 'tenants', 'location-a', 'businessInfo', 'new'), {
    name: 'Unsafe direct write',
    branding: { credentials: { password: 'plaintext' } },
    publicCredentialSafe: true,
  }));
  await assertFails(updateDoc(doc(manager, 'tenants', 'location-a', 'businessInfo', 'info'), {
    name: 'Direct update',
  }));
  await assertFails(deleteDoc(doc(manager, 'tenants', 'location-a', 'businessInfo', 'info')));
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
