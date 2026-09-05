const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'demo-elite-cuts-bootstrap';
let app;
let db;
let bootstrapTenantOwner;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  app = admin.apps.length > 0
    ? admin.app()
    : admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore(app);
  ({ bootstrapTenantOwner } = require('../functions/lib/bootstrapTenant.js'));
});

afterAll(async () => {
  await Promise.all([
    clearCollection('tenants'),
    clearCollection('subdomains'),
    clearCollection('memberships'),
  ]);
  await app.delete();
});

async function clearCollection(name) {
  const snapshot = await db.collection(name).get();
  await Promise.all(snapshot.docs.map(document => document.ref.delete()));
}

test.each([
  ['ownerUid', 'different-user'],
  ['uid', 'different-user'],
  ['userId', 'different-user'],
  ['tenantId', 'client-chosen-tenant'],
  ['role', 'superadmin'],
  ['permissions', { manageBilling: true }],
])('rejects client control of server-owned %s', async (field, value) => {
  await expect(bootstrapTenantOwner('owner-a', {
    subdomain: 'safe-salon',
    shopName: 'Safe Salon',
    planId: 'pro',
    [field]: value,
  }, db)).rejects.toMatchObject({ code: 'invalid-argument' });
});

test('bootstraps the caller as the fixed owner membership atomically', async () => {
  const result = await bootstrapTenantOwner('owner-a', {
    subdomain: 'owner-salon',
    shopName: 'Owner Salon',
    shopPhone: '+213555000000',
    shopAddress: 'Test address',
    planId: 'pro',
  }, db);

  const [tenant, subdomain, membership] = await Promise.all([
    db.collection('tenants').doc(result.tenantId).get(),
    db.collection('subdomains').doc('owner-salon').get(),
    db.collection('memberships').doc(result.membershipId).get(),
  ]);

  expect(result).toEqual({
    tenantId: expect.any(String),
    membershipId: expect.any(String),
    locationId: expect.any(String),
  });
  expect(result.locationId).toBe(result.tenantId);
  expect(tenant.data()).toMatchObject({ ownerUid: 'owner-a', subdomain: 'owner-salon' });
  expect(subdomain.data()).toMatchObject({ ownerUid: 'owner-a', tenantId: result.tenantId });
  expect(membership.data()).toMatchObject({
    userId: 'owner-a',
    brandId: result.tenantId,
    locationId: result.tenantId,
    role: 'principal_admin',
    status: 'active',
    permissions: {
      manageBilling: true,
      manageBookings: true,
      manageStaff: true,
    },
  });
});

test('reservation is the authoritative source for duplicate subdomain rejection', async () => {
  await db.collection('subdomains').doc('reserved-only').set({
    ownerUid: 'first-owner', tenantId: 'deleted-tenant',
  });

  await expect(bootstrapTenantOwner('second-owner', {
    subdomain: 'reserved-only', shopName: 'Second Salon', planId: 'basic',
  }, db)).rejects.toMatchObject({ code: 'already-exists' });
});
