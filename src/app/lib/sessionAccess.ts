import type { MembershipSummary } from './session';

export function membershipForLocation(
  memberships: MembershipSummary[],
  activeLocationId: string,
) {
  return memberships.find((membership) => membership.locationId === activeLocationId);
}

export function legacyRoleForLocation(
  roleClaim: unknown,
  tenantClaim: unknown,
  activeLocationId: string,
) {
  if (tenantClaim !== activeLocationId) return 'client';
  if (roleClaim === 'admin' || roleClaim === 'barber') return roleClaim;
  return 'client';
}
