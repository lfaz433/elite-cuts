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

test('a normal manager without platform claims can write only credential-safe public barber documents', async () => {
  await seedMembership('location-a__manager-a', 'manager-a', {
    brandId: 'location-a', locationId: 'location-a', role: 'principal_admin',
    permissions: { manageStaff: true, manageBookings: true },
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

test('missing platform claims do not cause an undefined-token evaluation error', async () => {
  const ordinaryUser = asUser('ordinary-user');

  const denial = await assertFails(setDoc(doc(ordinaryUser, 'barbers', 'unauthorized-barber'), {
    tenantId: 'location-a', name: 'Unauthorized Barber', publicCredentialSafe: true,
  }));

  expect(denial.message).not.toMatch(/Property (superadmin|platformAdmin) is undefined/);
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

test('a zero-permission marketplace worker is limited to their assigned barber workflow', async () => {
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
        barberId: 'worker-profile',
      }),
      setDoc(doc(ctx.firestore(), 'bookings', 'worker-booking'), {
        tenantId: 'location-market',
        locationId: 'location-market',
        clientId: 'client-a',
        barberId: 'worker-profile',
        unreadBarber: true,
        status: 'pending',
      }),
      setDoc(doc(ctx.firestore(), 'bookings', 'other-booking'), {
        tenantId: 'location-market',
        locationId: 'location-market',
        clientId: 'client-b',
        barberId: 'other-profile',
        unreadBarber: true,
        status: 'pending',
      }),
      setDoc(doc(ctx.firestore(), 'barbers', 'worker-profile'), {
        tenantId: 'location-market',
        locationId: 'location-market',
        brandId: 'brand-market',
        userId: 'worker-a',
        uid: 'worker-a',
        name: 'Worker A',
        status: 'available',
        publicCredentialSafe: true,
      }),
      setDoc(doc(ctx.firestore(), 'barbers', 'other-profile'), {
        tenantId: 'location-market',
        locationId: 'location-market',
        brandId: 'brand-market',
        userId: 'worker-b',
        uid: 'worker-b',
        name: 'Worker B',
        status: 'available',
        publicCredentialSafe: true,
      }),
      setDoc(doc(ctx.firestore(), 'services', 'public-service'), {
        tenantId: 'location-market', name: 'Cut', price: 25,
      }),
      setDoc(doc(ctx.firestore(), 'sales', 'private-sale'), {
        tenantId: 'location-market', sellerId: 'other-profile', sellPrice: 25,
      }),
    ]);
  });
  const worker = asUser('worker-a');

  await assertSucceeds(getDoc(doc(worker, 'bookings', 'worker-booking')));
  await assertFails(getDoc(doc(worker, 'bookings', 'other-booking')));
  await assertSucceeds(updateDoc(doc(worker, 'bookings', 'worker-booking'), {
    unreadBarber: false,
  }));
  await assertFails(updateDoc(doc(worker, 'bookings', 'other-booking'), {
    unreadBarber: false,
  }));
  await assertSucceeds(updateDoc(doc(worker, 'barbers', 'worker-profile'), {
    status: 'break',
  }));
  await assertFails(updateDoc(doc(worker, 'barbers', 'other-profile'), {
    status: 'break',
  }));
  await assertFails(setDoc(doc(worker, 'services', 'market-service'), {
    tenantId: 'location-market', name: 'Cut', price: 25,
  }));
  await assertSucceeds(getDoc(doc(worker, 'services', 'public-service')));
  await assertFails(getDoc(doc(worker, 'sales', 'private-sale')));
  await assertFails(setDoc(doc(worker, 'services', 'other-service'), {
    tenantId: 'location-other', name: 'Cross-location cut', price: 25,
  }));
});

test('a zero-permission worker can query only their own attendance and settlements', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all([
      setDoc(doc(ctx.firestore(), 'tenants', 'location-market'), {
        brandId: 'brand-market', ownerUid: 'principal-a',
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-market__location-market__worker-a'), {
        userId: 'worker-a',
        brandId: 'brand-market',
        locationId: 'location-market',
        role: 'worker',
        status: 'active',
        permissions: {},
        barberId: 'worker-profile',
      }),
      setDoc(doc(ctx.firestore(), 'attendance', 'worker-attendance'), {
        tenantId: 'location-market', barberId: 'worker-profile', date: '2026-09-05',
      }),
      setDoc(doc(ctx.firestore(), 'attendance', 'other-attendance'), {
        tenantId: 'location-market', barberId: 'other-profile', date: '2026-09-05',
      }),
      setDoc(doc(ctx.firestore(), 'settlements', 'worker-settlement'), {
        tenantId: 'location-market', barberId: 'worker-profile', amount: 50,
      }),
      setDoc(doc(ctx.firestore(), 'settlements', 'other-settlement'), {
        tenantId: 'location-market', barberId: 'other-profile', amount: 75,
      }),
    ]);
  });
  const worker = asUser('worker-a');

  const attendance = await assertSucceeds(getDocs(query(
    collection(worker, 'attendance'),
    where('tenantId', '==', 'location-market'),
    where('barberId', '==', 'worker-profile'),
  )));
  expect(attendance.docs.map(document => document.id)).toEqual(['worker-attendance']);

  const settlements = await assertSucceeds(getDocs(query(
    collection(worker, 'settlements'),
    where('tenantId', '==', 'location-market'),
    where('barberId', '==', 'worker-profile'),
  )));
  expect(settlements.docs.map(document => document.id)).toEqual(['worker-settlement']);

  await assertFails(getDocs(query(
    collection(worker, 'attendance'),
    where('tenantId', '==', 'location-market'),
  )));
  await assertFails(getDocs(query(
    collection(worker, 'settlements'),
    where('tenantId', '==', 'location-market'),
  )));
  await assertFails(getDocs(query(
    collection(worker, 'attendance'),
    where('tenantId', '==', 'location-market'),
    where('barberId', '==', 'other-profile'),
  )));
  await assertFails(getDocs(query(
    collection(worker, 'settlements'),
    where('tenantId', '==', 'location-market'),
    where('barberId', '==', 'other-profile'),
  )));
});

test('location permissions grant only their matching operational capabilities', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await Promise.all([
      setDoc(doc(ctx.firestore(), 'tenants', 'location-a'), {
        brandId: 'brand-a', ownerUid: 'principal-a',
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-a__location-a__booking-manager'), {
        userId: 'booking-manager', brandId: 'brand-a', locationId: 'location-a',
        role: 'salon_admin', status: 'active', permissions: { manageBookings: true },
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-a__location-a__service-manager'), {
        userId: 'service-manager', brandId: 'brand-a', locationId: 'location-a',
        role: 'salon_admin', status: 'active', permissions: { manageServices: true },
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-a__location-a__inventory-manager'), {
        userId: 'inventory-manager', brandId: 'brand-a', locationId: 'location-a',
        role: 'salon_admin', status: 'active', permissions: { manageInventory: true },
      }),
      setDoc(doc(ctx.firestore(), 'memberships', 'brand-a__location-a__staff-manager'), {
        userId: 'staff-manager', brandId: 'brand-a', locationId: 'location-a',
        role: 'salon_admin', status: 'active', permissions: { manageStaff: true },
      }),
      setDoc(doc(ctx.firestore(), 'bookings', 'location-booking'), {
        tenantId: 'location-a', locationId: 'location-a', clientId: 'client-a',
        barberId: 'barber-a', status: 'pending',
      }),
    ]);
  });
  const bookingManager = asUser('booking-manager');
  const serviceManager = asUser('service-manager');
  const inventoryManager = asUser('inventory-manager');
  const staffManager = asUser('staff-manager');

  await assertSucceeds(getDoc(doc(bookingManager, 'bookings', 'location-booking')));
  await assertFails(setDoc(doc(bookingManager, 'services', 'forbidden-service'), {
    tenantId: 'location-a', name: 'Cut', price: 25,
  }));
  await assertFails(getDoc(doc(serviceManager, 'bookings', 'location-booking')));
  await assertSucceeds(setDoc(doc(serviceManager, 'services', 'allowed-service'), {
    tenantId: 'location-a', name: 'Cut', price: 25,
  }));
  await assertSucceeds(setDoc(doc(inventoryManager, 'products', 'allowed-product'), {
    tenantId: 'location-a', name: 'Pomade', price: 15,
  }));
  await assertFails(setDoc(doc(inventoryManager, 'barbers', 'forbidden-barber'), {
    tenantId: 'location-a', name: 'No Staff Permission', publicCredentialSafe: true,
  }));
  await assertSucceeds(setDoc(doc(staffManager, 'barbers', 'allowed-barber'), {
    tenantId: 'location-a', name: 'New Worker', publicCredentialSafe: true,
  }));
  await assertFails(setDoc(doc(staffManager, 'products', 'forbidden-product'), {
    tenantId: 'location-a', name: 'Pomade', price: 15,
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
