import type { MembershipSummary } from '../session';

const BRAND_MANAGEMENT_PERMISSIONS = [
  'manageStaff',
  'inviteWorkers',
  'removeWorkers',
] as const;

export function isManagerEligibleMembership(membership: MembershipSummary): boolean {
  if (membership.status !== 'active') return false;
  if (!membership.locationId) return membership.role === 'principal_admin';
  return membership.role === 'principal_admin'
    || membership.role === 'salon_admin'
    || BRAND_MANAGEMENT_PERMISSIONS.some(permission => membership.permissions[permission] === true);
}

export function managerLocationIds(
  memberships: MembershipSummary[],
  brandId: string,
): string[] {
  return memberships
    .filter(membership => (
      membership.brandId === brandId
      && typeof membership.locationId === 'string'
      && isManagerEligibleMembership(membership)
    ))
    .map(membership => membership.locationId as string);
}

export function managerLocationForRoute(
  requestedLocationId: string | undefined,
  accessibleLocationIds: string[],
  currentLocationId: string | null,
): string | null {
  if (requestedLocationId && accessibleLocationIds.includes(requestedLocationId)) {
    return requestedLocationId;
  }
  if (currentLocationId && accessibleLocationIds.includes(currentLocationId)) {
    return currentLocationId;
  }
  return accessibleLocationIds[0] ?? null;
}

export async function resolveMarketplaceManager(
  memberships: MembershipSummary[],
  belongsToMarketplace: (membership: MembershipSummary) => Promise<boolean>,
): Promise<MembershipSummary | undefined> {
  const candidates = memberships
    .filter(isManagerEligibleMembership)
    .sort((left, right) => Number(Boolean(left.locationId)) - Number(Boolean(right.locationId)));

  for (const candidate of candidates) {
    if (await belongsToMarketplace(candidate)) return candidate;
  }
  return undefined;
}

interface BrandRouteUser {
  role: string;
  brandId?: string;
  memberships: MembershipSummary[];
}

export function hasBrandDashboardAccess(user: BrandRouteUser | null | undefined): boolean {
  if (!user?.brandId) return false;
  return user.memberships.some(membership => (
    membership.brandId === user.brandId && isManagerEligibleMembership(membership)
  ));
}

export function brandDashboardHomePath(user: BrandRouteUser): string {
  if (user.role === 'superadmin') return '/superadmin';
  if (hasBrandDashboardAccess(user)) return '/brand';
  return `/${user.role}`;
}
