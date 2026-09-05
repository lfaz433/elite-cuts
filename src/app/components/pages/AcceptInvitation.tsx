import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Check, Loader2, Scissors } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { db, functions } from '../../lib/firebase';
import { useAuth } from '../context/AuthContext';
import InvitationDecisionView, { type InvitationView } from './InvitationDecisionView';

interface InvitationResponseResult {
  membershipId: string;
  status: 'active' | 'declined';
}

function toInvitationView(value: Record<string, unknown>): InvitationView | null {
  if (
    typeof value.displayName !== 'string'
    || typeof value.email !== 'string'
    || (value.role !== 'salon_admin' && value.role !== 'worker')
    || (value.status !== 'pending' && value.status !== 'accepted' && value.status !== 'declined')
  ) return null;
  return value as unknown as InvitationView;
}

export default function AcceptInvitation() {
  const { invitationId } = useParams();
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<InvitationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<'active' | 'declined' | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!invitationId) {
        setError('Lien d’invitation invalide.');
        setLoading(false);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, 'invitations', invitationId));
        const record = snapshot.exists() ? toInvitationView(snapshot.data()) : null;
        if (!record) throw new Error('Invitation unavailable');
        if (active) setInvitation(record);
      } catch (reason) {
        console.warn('Invitation read rejected:', reason);
        if (active) setError('Cette invitation est introuvable ou appartient à un autre compte.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [invitationId]);

  const respond = async (accept: boolean) => {
    if (!invitationId) return;
    setSubmitting(true);
    try {
      const respondToInvitation = httpsCallable<
        { invitationId: string; accept: boolean },
        InvitationResponseResult
      >(functions, 'respondToInvitation');
      const result = await respondToInvitation({ invitationId, accept });
      setOutcome(result.data.status);
      if (result.data.status === 'active') await refreshSession();
      toast.success(result.data.status === 'active' ? 'Invitation acceptée.' : 'Invitation refusée.');
    } catch (reason) {
      console.error('Invitation response failed:', reason);
      toast.error('Impossible de répondre à cette invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070707] px-5 py-10 text-white">
      <button type="button" onClick={() => navigate('/')} className="mx-auto mb-8 flex items-center gap-2 text-sm font-black text-[#D4AF37]">
        <Scissors className="h-5 w-5" /> Barberboard
      </button>
      <div className="mx-auto flex max-w-3xl justify-center">
        {loading ? (
          <div className="flex items-center gap-3 text-white/50"><Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" /> Chargement de l’invitation…</div>
        ) : error ? (
          <section role="alert" className="w-full max-w-xl rounded-3xl border border-red-400/20 bg-red-400/10 p-8 text-center text-red-100">{error}</section>
        ) : outcome ? (
          <section className="w-full max-w-xl rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-9 text-center">
            <Check className="mx-auto h-9 w-9 text-[#D4AF37]" />
            <h1 className="mt-4 text-2xl font-black">{outcome === 'active' ? 'Accès activé' : 'Invitation refusée'}</h1>
            <p className="mt-2 text-sm text-white/50">{outcome === 'active' ? 'Votre propre compte est maintenant lié au salon.' : 'Aucun accès salon n’a été créé.'}</p>
            <button type="button" onClick={() => navigate('/', { replace: true })} className="mt-6 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black">Continuer</button>
          </section>
        ) : invitation ? (
          <InvitationDecisionView invitation={invitation} submitting={submitting} onRespond={respond} />
        ) : null}
      </div>
    </main>
  );
}
