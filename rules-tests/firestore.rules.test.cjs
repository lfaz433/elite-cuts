/**
 * Firestore Security Rules Unit Tests
 * Tests every case identified in the permissions bug report.
 *
 * Run with:
 *   firebase emulators:exec --only firestore "node --experimental-vm-modules node_modules/.bin/jest rules-tests/firestore.rules.test.js"
 */

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { setDoc, doc, collection, addDoc, updateDoc, getDoc } = require('firebase/firestore');

const PROJECT_ID = 'elite-cuts-app';
const RULES = readFileSync('./firestore.rules', 'utf8');

// ── helpers ───────────────────────────────────────────────────────────────
// auth param: { sub: 'some-uid' } — 'sub' is required by firebase/rules-unit-testing v4+
async function getFirestore(env, authSub) {
  return authSub
    ? env.authenticatedContext(authSub, { sub: authSub }).firestore()
    : env.unauthenticatedContext().firestore();
}

// ── Test Suite ────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: seed a users document for a given uid + tenantId
// ═══════════════════════════════════════════════════════════════════════════
async function seedUser(uid, tenantId, role = 'admin') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      uid,
      tenantId,
      role,
      email: `${uid}@test.com`,
    });
  });
}

async function seedTenant(tenantId, ownerUid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tenants', tenantId), {
      subdomain: tenantId,
      ownerUid,
      name: 'Test Salon',
      subscription: { status: 'trialing', planId: 'pro' },
      branding: { primaryColor: '#D4AF37', logoUrl: '', businessName: 'Test' },
      settings: { maxBarbersLimit: 8, allowOnlineBooking: true },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// T1 — Unauthenticated user cannot create a tenant
test('T1: Unauthenticated user cannot create a tenant', async () => {
  const db = await getFirestore(testEnv, null);
  await assertFails(
    setDoc(doc(db, 'tenants', 'newtenant'), {
      ownerUid: 'nobody',
      subdomain: 'newtenant',
      name: 'Hacked Salon',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T2 — Brand-new user (no Firestore users doc yet) can create tenant where ownerUid == uid
// This is the CRITICAL test that was failing before the rules fix
// ═══════════════════════════════════════════════════════════════════════════
test('T2: New user with no Firestore doc can create tenant where ownerUid == uid (Fix #2)', async () => {
  const uid = 'brand-new-user';
  const db = await getFirestore(testEnv, uid);

  await assertSucceeds(
    setDoc(doc(db, 'tenants', 'mytenant'), {
      ownerUid: uid,
      subdomain: 'mytenant',
      name: 'My New Salon',
      subscription: { status: 'trialing', planId: 'pro' },
      branding: { primaryColor: '#D4AF37', logoUrl: '', businessName: 'My Salon' },
      settings: { maxBarbersLimit: 8, allowOnlineBooking: true },
      createdAt: Date.now(),
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T3 — Authenticated user can create tenant IF ownerUid != uid (spoofing)
// Should FAIL
// ═══════════════════════════════════════════════════════════════════════════
test('T3: User cannot create a tenant where ownerUid is someone elses uid', async () => {
  const db = await getFirestore(testEnv, 'attacker-uid');

  await assertFails(
    setDoc(doc(db, 'tenants', 'victimtenant'), {
      ownerUid: 'victim-uid',
      subdomain: 'victimtenant',
      name: 'Spoofed Salon',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T4 — User with matching tenantId can add a barber (SHOULD PASS)
// ═══════════════════════════════════════════════════════════════════════════
test('T4: Tenant member can create a barber for their tenant', async () => {
  const uid = 'admin-uid';
  const tenantId = 'salon-abc';
  await seedUser(uid, tenantId, 'admin');

  const db = await getFirestore(testEnv, uid);

  await assertSucceeds(
    addDoc(collection(db, 'barbers'), {
      name: 'Karim',
      tenantId: tenantId,
      specialty: 'Coupe',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T5 — User with MISMATCHED tenantId cannot add barber to another tenant
// ═══════════════════════════════════════════════════════════════════════════
test('T5: User cannot create a barber for a different tenant', async () => {
  const uid = 'attacker-uid';
  await seedUser(uid, 'my-tenant', 'admin');

  const db = await getFirestore(testEnv, uid);

  await assertFails(
    addDoc(collection(db, 'barbers'), {
      name: 'Fake Barber',
      tenantId: 'other-tenant',
      specialty: 'Coupe',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T6 — Authenticated user can create subdomain reservation where ownerUid == uid
// ═══════════════════════════════════════════════════════════════════════════
test('T6: Authenticated user can reserve a subdomain for themselves', async () => {
  const uid = 'new-owner-uid';
  const db = await getFirestore(testEnv, uid);

  await assertSucceeds(
    setDoc(doc(db, 'subdomains', 'mysalon'), {
      ownerUid: uid,
      tenantId: 'some-id',
      createdAt: new Date().toISOString(),
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T7 — User cannot reserve subdomain for someone else
// ═══════════════════════════════════════════════════════════════════════════
test('T7: User cannot create subdomain reservation with another uid', async () => {
  const db = await getFirestore(testEnv, 'attacker');

  await assertFails(
    setDoc(doc(db, 'subdomains', 'victim-salon'), {
      ownerUid: 'victim-uid',
      tenantId: 'some-id',
      createdAt: new Date().toISOString(),
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T8 — Tenant member can update their own tenant settings (onboarding)
// ═══════════════════════════════════════════════════════════════════════════
test('T8: Tenant member can update their tenant (finalizing onboarding)', async () => {
  const uid = 'owner-uid';
  const tenantId = 'salon-xyz';
  await seedUser(uid, tenantId, 'admin');
  await seedTenant(tenantId, uid);

  const db = await getFirestore(testEnv, uid);

  await assertSucceeds(
    updateDoc(doc(db, 'tenants', tenantId), {
      'settings.weeklyHours': {},
      onboardingComplete: true,
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T9 — Non-member cannot update another tenant
// ═══════════════════════════════════════════════════════════════════════════
test('T9: Non-member cannot update a tenant they do not belong to', async () => {
  const ownerUid = 'real-owner';
  const tenantId = 'real-salon';
  await seedUser(ownerUid, tenantId, 'admin');
  await seedTenant(tenantId, ownerUid);

  await seedUser('attacker', 'other-salon', 'admin');
  const db = await getFirestore(testEnv, 'attacker');

  await assertFails(
    updateDoc(doc(db, 'tenants', tenantId), {
      name: 'HACKED',
    })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// T10 — SuperAdmin can do anything
// ═══════════════════════════════════════════════════════════════════════════
test('T10: SuperAdmin can update any tenant', async () => {
  const superUid = 'super-admin-uid';
  await seedUser(superUid, 'admin-tenant', 'superadmin');
  const tenantId = 'some-salon';
  await seedTenant(tenantId, 'some-owner');

  const db = await getFirestore(testEnv, superUid);

  await assertSucceeds(
    updateDoc(doc(db, 'tenants', tenantId), {
      'subscription.status': 'active',
    })
  );
});
