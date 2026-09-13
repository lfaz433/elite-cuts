const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const migration = require(resolve(
  __dirname,
  '..',
  'scripts',
  'lib',
  'legacy-authority-plan.cjs',
));

const ownerPermissions = {
  manageBilling: true,
  manageBookings: true,
  manageStaff: true,
};

test('only trusted tenant owners become migration candidates', () => {
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [{ id: 'tenant-a', ownerUid: 'owner-a' }],
    memberships: {},
    authUsers: [{ uid: 'owner-a', customClaims: {} }],
    legacyProfiles: [
      { id: 'legacy-admin', uid: 'legacy-admin', tenantId: 'tenant-a', role: 'admin', email: 'private@example.test' },
    ],
  });

  expect(plan.membershipCreates).toEqual([expect.objectContaining({
    id: 'tenant-a__owner-a',
    data: expect.objectContaining({
      userId: 'owner-a', brandId: 'tenant-a', locationId: 'tenant-a',
      role: 'principal_admin', status: 'active', permissions: ownerPermissions,
    }),
  })]);
  expect(plan.reviewCandidates).toEqual([{
    profileId: 'legacy-admin', tenantId: 'tenant-a', role: 'admin',
    reason: 'client_writable_profile_is_not_authority',
  }]);
  expect(JSON.stringify(plan)).not.toContain('private@example.test');
});

test('a compatible existing owner membership is preserved and enables safe legacy-claim retirement', () => {
  const existing = {
    userId: 'owner-a', brandId: 'tenant-a', locationId: 'tenant-a', role: 'principal_admin',
    status: 'active', permissions: ownerPermissions, createdAt: 'original', customField: 'preserve-me',
  };
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [{ id: 'tenant-a', ownerUid: 'owner-a' }],
    memberships: { 'tenant-a__owner-a': existing },
    authUsers: [{ uid: 'owner-a', customClaims: { tenantId: 'tenant-a', role: 'admin', unrelated: 'keep' } }],
    legacyProfiles: [],
  });

  expect(plan.membershipCreates).toEqual([]);
  expect(plan.skippedExisting).toEqual(['tenant-a__owner-a']);
  expect(plan.claimUpdates).toEqual([{
    uid: 'owner-a', claims: { unrelated: 'keep' },
    reason: 'canonical_membership_verified',
  }]);
  expect(existing).toEqual(expect.objectContaining({ createdAt: 'original', customField: 'preserve-me' }));
});

test('a first-run owner membership is created before its legacy claim is retired', () => {
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [{ id: 'tenant-a', ownerUid: 'owner-a' }],
    memberships: {},
    authUsers: [{ uid: 'owner-a', customClaims: { tenantId: 'tenant-a', role: 'admin', unrelated: 'keep' } }],
    legacyProfiles: [],
  });

  expect(plan.membershipCreates).toHaveLength(1);
  expect(plan.claimUpdates).toEqual([{
    uid: 'owner-a', claims: { unrelated: 'keep' },
    reason: 'canonical_membership_planned',
  }]);
});

test.each([
  ['staff with membership', { tenantId: 'tenant-a', role: 'barber', keep: true }, {
    'tenant-a__staff-a': {
      userId: 'staff-a', brandId: 'tenant-a', locationId: 'tenant-a',
      role: 'worker', status: 'active', permissions: { manageBookings: true },
    },
  }, 'canonical_membership_verified'],
  ['revoked staff', { tenantId: 'tenant-a', role: 'barber', keep: true }, {}, 'legacy_claim_revoked_without_membership'],
  ['roleless claimant', { tenantId: 'tenant-a', keep: true }, {}, 'legacy_claim_revoked_without_membership'],
  ['role-only claimant', { role: 'admin', keep: true }, {}, 'legacy_role_claim_retired'],
])('retires authority claims for %s', (_label, customClaims, memberships, reason) => {
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [{ id: 'tenant-a', ownerUid: 'owner-a' }],
    memberships,
    authUsers: [{ uid: 'staff-a', customClaims }],
    legacyProfiles: [],
  });

  expect(plan.claimUpdates).toEqual([{
    uid: 'staff-a', claims: { keep: true }, reason,
  }]);
});

test('conflicts and missing Auth users are deferred without overwrites', () => {
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [
      { id: 'tenant-a', ownerUid: 'owner-a' },
      { id: 'tenant-b', ownerUid: 'missing-owner' },
    ],
    memberships: {
      'tenant-a__owner-a': {
        userId: 'someone-else', brandId: 'tenant-a', locationId: 'tenant-a', role: 'principal_admin',
        status: 'active', permissions: ownerPermissions,
      },
    },
    authUsers: [{ uid: 'owner-a', customClaims: {} }],
    legacyProfiles: [],
  });

  expect(plan.conflicts).toEqual([{ id: 'tenant-a__owner-a', reason: 'existing_membership_mismatch' }]);
  expect(plan.deferred).toEqual([{ id: 'tenant-b__missing-owner', reason: 'auth_user_missing' }]);
  expect(plan.membershipCreates).toEqual([]);
  expect(plan.claimUpdates).toEqual([]);
});

test('an incompatible owner membership blocks that owner claim retirement', () => {
  const plan = migration.planLegacyAuthorityMigration({
    tenants: [{ id: 'tenant-a', ownerUid: 'owner-a' }],
    memberships: {
      'tenant-a__owner-a': {
        userId: 'someone-else', brandId: 'tenant-a', locationId: 'tenant-a',
        role: 'principal_admin', status: 'active', permissions: ownerPermissions,
      },
    },
    authUsers: [{
      uid: 'owner-a',
      customClaims: { tenantId: 'tenant-a', role: 'admin', unrelated: 'keep' },
    }],
    legacyProfiles: [],
  });

  expect(plan.conflicts).toEqual([
    { id: 'tenant-a__owner-a', reason: 'existing_membership_mismatch' },
  ]);
  expect(plan.claimUpdates).toEqual([]);
});

test('dry-run executes no writes while apply executes only planned operations', async () => {
  const calls = [];
  const plan = {
    membershipCreates: [{ id: 'membership-a', data: { userId: 'owner-a' } }],
    claimUpdates: [{ uid: 'owner-b', claims: { unrelated: true } }],
  };
  const operations = {
    createMembership: async (...args) => calls.push(['membership', ...args]),
    updateClaims: async (...args) => calls.push(['claims', ...args]),
  };

  await migration.executeLegacyAuthorityPlan(plan, operations, { apply: false });
  expect(calls).toEqual([]);
  await migration.executeLegacyAuthorityPlan(plan, operations, { apply: true });
  expect(calls).toEqual([
    ['membership', 'membership-a', { userId: 'owner-a' }],
    ['claims', 'owner-b', { unrelated: true }],
  ]);
});

test('apply fails closed before its first write when the plan has any conflict', async () => {
  const calls = [];
  const plan = {
    membershipCreates: [{ id: 'membership-a', data: { userId: 'owner-a' } }],
    claimUpdates: [{ uid: 'owner-a', claims: {} }],
    conflicts: [{ id: 'tenant-conflict__owner-a', reason: 'existing_membership_mismatch' }],
  };
  const operations = {
    createMembership: async (...args) => calls.push(['membership', ...args]),
    updateClaims: async (...args) => calls.push(['claims', ...args]),
  };

  await expect(migration.executeLegacyAuthorityPlan(plan, operations, { apply: true }))
    .rejects.toThrow('Migration plan has unresolved conflicts');
  expect(calls).toEqual([]);
});

test('migration CLI refuses production without exact confirmation before reading data', () => {
  const script = resolve(__dirname, '..', 'scripts', 'migrate-legacy-authority.mjs');
  const result = spawnSync(process.execPath, [script, '--project', 'production', '--apply'], {
    env: { ...process.env, CONFIRM_PRODUCTION_MIGRATION: '' },
  });

  expect(result.status).toBe(2);
  expect(result.stderr.toString()).toContain('CONFIRM_PRODUCTION_MIGRATION=elite-cuts-app');
});

test('rules no longer treat legacy tenant or role claims as tenant authority', () => {
  const rules = require('node:fs').readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
  expect(rules).not.toContain('hasLegacyTenantClaim');
  expect(rules).not.toContain('hasLegacyTenantAdminClaim');
  expect(rules).not.toContain('request.auth.token.role == "admin"');
});
