'use strict';

const MIGRATION_VERSION = 'legacy-authority-v1';
const OWNER_PERMISSIONS = Object.freeze({
  manageBilling: true,
  manageBookings: true,
  manageStaff: true,
});
const PRIVILEGED_PROFILE_ROLES = new Set([
  'admin',
  'salon_admin',
  'principal_admin',
  'superadmin',
]);
const LEGACY_AUTHORITY_ROLES = new Set([
  ...PRIVILEGED_PROFILE_ROLES,
  'barber',
  'worker',
]);

function membershipId(tenantId, ownerUid) {
  return `${tenantId}__${ownerUid}`;
}

function compatibleOwnerMembership(value, tenantId, ownerUid) {
  return Boolean(
    value
    && value.userId === ownerUid
    && value.brandId === tenantId
    && value.locationId === tenantId
    && value.role === 'principal_admin'
    && value.status === 'active'
    && value.permissions
    && Object.entries(OWNER_PERMISSIONS).every(([key, expected]) => value.permissions[key] === expected),
  );
}

function compatibleLegacyMembership(value, tenantId, uid) {
  return Boolean(
    value
    && value.userId === uid
    && value.locationId === tenantId
    && value.status === 'active',
  );
}

function planLegacyAuthorityMigration({
  tenants = [],
  memberships = {},
  authUsers = [],
  legacyProfiles = [],
}) {
  const usersById = new Map(authUsers
    .filter(user => user && typeof user.uid === 'string')
    .map(user => [user.uid, user]));
  const membershipCreates = [];
  const skippedExisting = [];
  const claimUpdates = [];
  const conflicts = [];
  const deferred = [];

  for (const tenant of [...tenants].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    if (
      !tenant
      || typeof tenant.id !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(tenant.id)
      || typeof tenant.ownerUid !== 'string'
      || !tenant.ownerUid.trim()
    ) {
      deferred.push({ id: typeof tenant?.id === 'string' ? tenant.id : '(invalid)', reason: 'tenant_owner_invalid' });
      continue;
    }
    const id = membershipId(tenant.id, tenant.ownerUid);
    const authUser = usersById.get(tenant.ownerUid);
    if (!authUser) {
      deferred.push({ id, reason: 'auth_user_missing' });
      continue;
    }
    const existing = memberships[id];
    if (existing) {
      if (!compatibleOwnerMembership(existing, tenant.id, tenant.ownerUid)) {
        conflicts.push({ id, reason: 'existing_membership_mismatch' });
        continue;
      }
      skippedExisting.push(id);
      continue;
    }

    membershipCreates.push({
      id,
      data: {
        userId: tenant.ownerUid,
        brandId: tenant.id,
        locationId: tenant.id,
        role: 'principal_admin',
        status: 'active',
        permissions: { ...OWNER_PERMISSIONS },
        migrationVersion: MIGRATION_VERSION,
        sourceTenantId: tenant.id,
      },
    });
  }

  const plannedMembershipIds = new Set(membershipCreates.map(item => item.id));
  const conflictedMembershipIds = new Set(conflicts.map(item => item.id));
  const ownersByTenant = new Map(tenants
    .filter(tenant => typeof tenant?.id === 'string' && typeof tenant?.ownerUid === 'string')
    .map(tenant => [tenant.id, tenant.ownerUid]));
  for (const authUser of [...authUsers].sort((left, right) => String(left?.uid).localeCompare(String(right?.uid)))) {
    if (!authUser || typeof authUser.uid !== 'string') continue;
    const claims = authUser.customClaims && typeof authUser.customClaims === 'object'
      ? authUser.customClaims
      : {};
    const hasTenantClaim = Object.prototype.hasOwnProperty.call(claims, 'tenantId');
    const hasLegacyRole = typeof claims.role === 'string' && LEGACY_AUTHORITY_ROLES.has(claims.role);
    if (!hasTenantClaim && !hasLegacyRole) continue;

    const tenantId = typeof claims.tenantId === 'string' ? claims.tenantId : null;
    const id = tenantId ? membershipId(tenantId, authUser.uid) : null;
    if (id && conflictedMembershipIds.has(id)) continue;
    let reason = 'legacy_role_claim_retired';
    if (id && plannedMembershipIds.has(id)) {
      reason = 'canonical_membership_planned';
    } else if (id && compatibleLegacyMembership(memberships[id], tenantId, authUser.uid)) {
      reason = 'canonical_membership_verified';
    } else if (tenantId && ownersByTenant.get(tenantId) === authUser.uid) {
      reason = 'tenant_owner_record_verified';
    } else if (tenantId) {
      reason = 'legacy_claim_revoked_without_membership';
    }
    const { tenantId: _tenantId, role: _role, ...preservedClaims } = claims;
    claimUpdates.push({ uid: authUser.uid, claims: preservedClaims, reason });
  }

  const trustedOwners = new Set(tenants
    .filter(tenant => typeof tenant?.ownerUid === 'string')
    .map(tenant => tenant.ownerUid));
  const reviewCandidates = legacyProfiles
    .filter(profile => (
      profile
      && typeof profile.id === 'string'
      && typeof profile.role === 'string'
      && PRIVILEGED_PROFILE_ROLES.has(profile.role)
      && !trustedOwners.has(typeof profile.uid === 'string' ? profile.uid : profile.id)
    ))
    .map(profile => ({
      profileId: profile.id,
      ...(typeof profile.tenantId === 'string' ? { tenantId: profile.tenantId } : {}),
      role: profile.role,
      reason: 'client_writable_profile_is_not_authority',
    }));

  return {
    version: MIGRATION_VERSION,
    membershipCreates,
    skippedExisting,
    claimUpdates,
    conflicts,
    deferred,
    reviewCandidates,
  };
}

async function executeLegacyAuthorityPlan(plan, operations, { apply = false } = {}) {
  if (!apply) {
    return {
      dryRun: true,
      membershipCreates: plan.membershipCreates.length,
      claimUpdates: plan.claimUpdates.length,
    };
  }
  if (Array.isArray(plan.conflicts) && plan.conflicts.length > 0) {
    throw new Error('Migration plan has unresolved conflicts; no writes were applied');
  }
  for (const item of plan.membershipCreates) {
    await operations.createMembership(item.id, item.data);
  }
  for (const item of plan.claimUpdates) {
    await operations.updateClaims(item.uid, item.claims);
  }
  return {
    dryRun: false,
    membershipCreates: plan.membershipCreates.length,
    claimUpdates: plan.claimUpdates.length,
  };
}

module.exports = {
  MIGRATION_VERSION,
  OWNER_PERMISSIONS,
  compatibleOwnerMembership,
  compatibleLegacyMembership,
  executeLegacyAuthorityPlan,
  membershipId,
  planLegacyAuthorityMigration,
};
