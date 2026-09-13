import React from 'react';
import type { PermissionKey } from '../../lib/marketplace/types';
import PermissionEditor from './PermissionEditor';

export interface PermissionMember {
  id: string;
  displayName: string;
  email: string;
  permissions: Record<PermissionKey, boolean>;
}

interface MembershipPermissionManagerProps {
  members: PermissionMember[];
  selectedId: string;
  value: Record<PermissionKey, boolean>;
  onSelect: (membershipId: string) => void;
  onChange: (permissions: Record<PermissionKey, boolean>) => void;
  onSave: (membershipId: string) => Promise<void>;
  saving?: boolean;
}

export default function MembershipPermissionManager({
  members,
  selectedId,
  value,
  onSelect,
  onChange,
  onSave,
  saving = false,
}: MembershipPermissionManagerProps) {
  return (
    <div className="space-y-6">
      <label className="block space-y-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
          Salon Admin
        </span>
        <select
          aria-label="Salon Admin"
          value={selectedId}
          onChange={event => onSelect(event.currentTarget.value)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
        >
          {members.map(member => (
            <option key={member.id} value={member.id}>
              {member.displayName} — {member.email}
            </option>
          ))}
        </select>
      </label>
      <PermissionEditor value={value} onChange={onChange} showRole={false} />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving || !selectedId}
          onClick={() => onSave(selectedId)}
          className="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les droits'}
        </button>
      </div>
    </div>
  );
}
