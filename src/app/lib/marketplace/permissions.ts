import type { PermissionKey } from './types';

export const PERMISSION_KEYS: readonly PermissionKey[] = [
  'manageBookings',
  'manageStaff',
  'inviteWorkers',
  'removeWorkers',
  'manageServices',
  'manageInventory',
  'manageJobs',
  'manageLocationBranding',
];

export const DEFAULT_PRINCIPAL_ADMIN_PERMISSIONS: Record<PermissionKey, boolean> = {
  manageBookings: true,
  manageStaff: true,
  inviteWorkers: true,
  removeWorkers: true,
  manageServices: true,
  manageInventory: true,
  manageJobs: true,
  manageLocationBranding: true,
};

export const DEFAULT_SALON_ADMIN_PERMISSIONS = {
  manageBookings: true, manageStaff: true, inviteWorkers: false, removeWorkers: false,
  manageServices: true, manageInventory: false, manageJobs: true, manageLocationBranding: false,
} as const;

export const DEFAULT_WORKER_PERMISSIONS: Record<PermissionKey, boolean> = {
  manageBookings: false,
  manageStaff: false,
  inviteWorkers: false,
  removeWorkers: false,
  manageServices: false,
  manageInventory: false,
  manageJobs: false,
  manageLocationBranding: false,
};
