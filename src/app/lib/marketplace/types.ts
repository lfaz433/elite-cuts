export type PermissionKey =
  | 'manageBookings'
  | 'manageStaff'
  | 'inviteWorkers'
  | 'removeWorkers'
  | 'manageServices'
  | 'manageInventory'
  | 'manageJobs'
  | 'manageLocationBranding';

export type MembershipRole = 'principal_admin' | 'salon_admin' | 'worker';

export type MembershipStatus = 'pending' | 'active' | 'declined' | 'revoked';

export interface Membership {
  userId: string;
  brandId: string;
  locationId?: string;
  role: MembershipRole;
  status: MembershipStatus;
  permissions: Record<PermissionKey, boolean>;
}

export interface Brand {
  id: string;
  name: string;
  ownerUid: string;
}

export interface SalonLocation {
  id: string;
  brandId: string;
  name: string;
  city: string;
  countryCode: string;
  address?: string;
  phone?: string;
  timezone?: string;
}
