import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

export type InvitationRole = 'salon_admin' | 'worker';

export interface WorkerInviteDialogProps {
  locationId: string;
  open: boolean;
  canInviteSalonAdmins?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (invitationId: string) => void;
}

export interface CreateWorkerInvitationInput {
  locationId: string;
  email: string;
  displayName: string;
  role: InvitationRole;
}

interface WorkerInviteDialogViewProps extends WorkerInviteDialogProps {
  createInvitation: (input: CreateWorkerInvitationInput) => Promise<{ invitationId: string }>;
}

export default function WorkerInviteDialogView({
  locationId,
  open,
  canInviteSalonAdmins = false,
  onOpenChange,
  onCreated,
  createInvitation,
}: WorkerInviteDialogViewProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<InvitationRole>('worker');
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  useEffect(() => {
    if (!open) {
      setEmail('');
      setDisplayName('');
      setRole('worker');
      setSubmitting(false);
      setCreatedLink('');
    }
  }, [open]);

  useEffect(() => {
    if (!canInviteSalonAdmins && role === 'salon_admin') setRole('worker');
  }, [canInviteSalonAdmins, role]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await createInvitation({
        locationId,
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
      });
      setCreatedLink(`${window.location.origin}/invitations/${result.invitationId}`);
      toast.success('Invitation créée. Partagez le lien avec le collaborateur.');
      onCreated?.(result.invitationId);
    } catch (error) {
      console.error('Worker invitation failed:', error);
      toast.error('Impossible de créer cette invitation. Vérifiez vos autorisations.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onOpenChange(false);
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="worker-invite-title" className="w-full max-w-lg rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#D4AF37] text-black"><UserPlus className="h-5 w-5" /></span>
            <div>
              <h2 id="worker-invite-title" className="text-xl font-black text-white">Inviter un collaborateur</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/45">Le collaborateur utilisera son propre compte et choisira lui-même son mot de passe.</p>
            </div>
          </div>
          <button type="button" aria-label="Fermer" disabled={submitting} onClick={() => onOpenChange(false)} className="rounded-xl p-2 text-white/45 hover:bg-white/5 hover:text-white disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {createdLink ? (
          <div className="mt-7 space-y-4">
            <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">L’invitation est en attente. Aucun accès n’est actif.</p>
            <label className="block text-sm font-bold text-white/70">
              Lien d’invitation
              <input readOnly value={createdLink} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/75" />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => void navigator.clipboard?.writeText(createdLink).then(() => toast.success('Lien copié.'))} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/70 hover:bg-white/5">Copier le lien</button>
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black">Terminer</button>
            </div>
          </div>
        ) : <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-bold text-white/70">
            Nom affiché
            <input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]/70" placeholder="Samira Benali" />
          </label>
          <label className="block text-sm font-bold text-white/70">
            Adresse e-mail du compte invité
            <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]/70" placeholder="samira@example.com" />
          </label>
          <label className="block text-sm font-bold text-white/70">
            Rôle
            <select value={role} onChange={(event) => setRole(event.currentTarget.value as InvitationRole)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]/70">
              <option value="worker">Collaborateur</option>
              {canInviteSalonAdmins && <option value="salon_admin">Salon Admin</option>}
            </select>
          </label>
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-white/45">
            Aucun accès ne sera activé avant que cette adresse e-mail accepte l’invitation.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" disabled={submitting} onClick={() => onOpenChange(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/65 hover:bg-white/5 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-60">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer l’invitation
            </button>
          </div>
        </form>}
      </section>
    </div>
  );
}
