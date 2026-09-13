import React from 'react';
import { KeyRound, UserPlus } from 'lucide-react';

export default function StaffInvitationNotice({ onInvite }: { onInvite: () => void }) {
  return (
    <section className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#D4AF37]" />
        <div>
          <h4 className="text-sm font-black text-white">Accès appartenant au collaborateur</h4>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Le salon ne crée aucun mot de passe. Le collaborateur reçoit une invitation,
            utilise son propre compte et choisit lui-même ses identifiants.
          </p>
          <button
            type="button"
            onClick={onInvite}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-xs font-black text-black"
          >
            <UserPlus className="h-3.5 w-3.5" /> Ouvrir les invitations
          </button>
        </div>
      </div>
    </section>
  );
}
