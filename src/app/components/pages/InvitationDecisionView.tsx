import React from 'react';
import { Check, Loader2, ShieldCheck, X } from 'lucide-react';

export interface InvitationView {
  displayName: string;
  email: string;
  role: 'salon_admin' | 'worker';
  status: 'pending' | 'accepted' | 'declined';
}

interface InvitationDecisionViewProps {
  invitation: InvitationView;
  submitting: boolean;
  onRespond: (accept: boolean) => void;
}

export default function InvitationDecisionView({
  invitation,
  submitting,
  onRespond,
}: InvitationDecisionViewProps) {
  const roleLabel = invitation.role === 'salon_admin' ? 'Salon Admin' : 'Collaborateur';

  return (
    <section className="w-full max-w-xl rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-7 shadow-2xl sm:p-10">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#D4AF37] text-black"><ShieldCheck className="h-6 w-6" /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">Invitation Elite Cuts</p>
          <h1 className="mt-2 text-2xl font-black text-white">Bonjour {invitation.displayName}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">Cette invitation est réservée au compte <strong className="text-white/80">{invitation.email}</strong>.</p>
        </div>
      </div>

      <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs uppercase tracking-wider text-white/40">Rôle proposé</p>
        <p className="mt-2 text-lg font-black text-white">{roleLabel}</p>
      </div>

      {invitation.status === 'pending' ? (
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={submitting} onClick={() => onRespond(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white/70 hover:bg-white/5 disabled:opacity-50">
            <X className="h-4 w-4" /> Refuser
          </button>
          <button type="button" disabled={submitting} onClick={() => onRespond(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accepter
          </button>
        </div>
      ) : (
        <p className="mt-7 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-white/60">
          Cette invitation a déjà été {invitation.status === 'accepted' ? 'acceptée' : 'refusée'}.
        </p>
      )}
    </section>
  );
}
