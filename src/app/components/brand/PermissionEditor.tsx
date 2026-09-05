import React from 'react';
import type { MembershipRole, PermissionKey } from '../../lib/marketplace/types';
import { PERMISSION_KEYS } from '../../lib/marketplace/permissions';

export type SalonAdminAssignableRole = Exclude<MembershipRole, 'principal_admin'>;

export const SALON_ADMIN_ASSIGNABLE_ROLES: readonly SalonAdminAssignableRole[] = [
  'salon_admin',
  'worker',
];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  manageBookings: 'Gérer les réservations',
  manageStaff: 'Gérer l’équipe',
  inviteWorkers: 'Inviter des collaborateurs',
  removeWorkers: 'Retirer des collaborateurs',
  manageServices: 'Gérer les services',
  manageInventory: 'Gérer l’inventaire',
  manageJobs: 'Gérer les missions',
};

interface PermissionEditorProps {
  value: Record<PermissionKey, boolean>;
  onChange: (value: Record<PermissionKey, boolean>) => void;
  disabledKeys?: readonly PermissionKey[];
  role?: SalonAdminAssignableRole;
  onRoleChange?: (role: SalonAdminAssignableRole) => void;
  showRole?: boolean;
}

export default function PermissionEditor({
  value,
  onChange,
  disabledKeys = [],
  role = 'salon_admin',
  onRoleChange,
  showRole = true,
}: PermissionEditorProps) {
  return (
    <div className="space-y-5">
      {showRole && <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
          Rôle attribuable
        </span>
        <select
          aria-label="Rôle attribuable"
          value={role}
          onChange={event => onRoleChange?.(event.currentTarget.value as SalonAdminAssignableRole)}
          disabled={!onRoleChange}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37] disabled:opacity-70"
        >
          {SALON_ADMIN_ASSIGNABLE_ROLES.map(assignableRole => (
            <option key={assignableRole} value={assignableRole}>
              {assignableRole === 'salon_admin' ? 'Salon Admin' : 'Collaborateur'}
            </option>
          ))}
        </select>
      </label>}

      <div className="grid gap-3 sm:grid-cols-2">
        {PERMISSION_KEYS.map(key => {
          const disabled = disabledKeys.includes(key);
          return (
            <label
              key={key}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <span className="text-sm text-white/75">{PERMISSION_LABELS[key]}</span>
              <input
                type="checkbox"
                name={key}
                checked={value[key]}
                disabled={disabled}
                onChange={event => onChange({ ...value, [key]: event.currentTarget.checked })}
                className="h-4 w-4 accent-[#D4AF37] disabled:opacity-40"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
