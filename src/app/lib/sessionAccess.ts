import type { MembershipSummary } from './session';

export function membershipForLocation(
  memberships: MembershipSummary[],
  activeLocationId: string,
) {
  return memberships.find((membership) => membership.locationId === activeLocationId);
}
