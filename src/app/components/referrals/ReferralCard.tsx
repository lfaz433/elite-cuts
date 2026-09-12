import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  creditLabel,
  getMyReferralWorkspace,
  referralLink,
  type ReferralWorkspace,
} from '../../lib/marketplace/referrals';

interface ReferralCardProps {
  title: string;
  description: string;
}

function codeStatus(status: string): string {
  if (status === 'active') return 'Actif';
  if (status === 'paused') return 'En pause';
  if (status === 'archived') return 'Archivé';
  return status;
}

function creditSummary(workspace: ReferralWorkspace): Array<{ currency: string; amountMinor: number; pending: boolean }> {
  const totals = new Map<string, { amountMinor: number; pending: boolean }>();
  for (const reward of workspace.rewards) {
    if (reward.status !== 'approved' && reward.status !== 'pending') continue;
    const current = totals.get(reward.currency) ?? { amountMinor: 0, pending: false };
    current.amountMinor += reward.amountMinor;
    current.pending ||= reward.status === 'pending';
    totals.set(reward.currency, current);
  }
  return [...totals.entries()].map(([currency, summary]) => ({ currency, ...summary }));
}

export default function ReferralCard({ title, description }: ReferralCardProps) {
  const [workspace, setWorkspace] = useState<ReferralWorkspace | null>(null);
  const [error, setError] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getMyReferralWorkspace().then(result => {
      if (!current) return;
      setWorkspace(result);
      setError(false);
    }).catch(() => {
      if (!current) return;
      setError(true);
    });
    return () => { current = false; };
  }, []);

  const credits = useMemo(() => workspace ? creditSummary(workspace) : [], [workspace]);
  const copyLink = async (code: string) => {
    const link = referralLink(window.location.origin, code);
    if (!navigator.clipboard) {
      toast.error('Le presse-papiers n’est pas disponible sur cet appareil.');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      toast.success('Lien de parrainage copié.');
    } catch {
      toast.error('Impossible de copier le lien de parrainage.');
    }
  };
  const shareLink = async (code: string) => {
    const link = referralLink(window.location.origin, code);
    if (!navigator.share) {
      await copyLink(code);
      return;
    }
    try {
      await navigator.share({ title: 'Barberboard', text: 'Utilisez mon lien de parrainage Barberboard.', url: link });
    } catch (reason) {
      if ((reason as DOMException).name !== 'AbortError') toast.error('Le partage est indisponible pour le moment.');
    }
  };

  return (
    <section className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#1b170b] to-[#111] p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#D4AF37] text-black"><Gift className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-white/55">{description}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-[#f5dfa0]">Le crédit est accordé après le premier rendez-vous terminé de la personne invitée.</p>

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">Votre espace de parrainage ne peut pas être chargé pour le moment.</p> : workspace === null ? <p className="mt-4 text-sm text-white/50">Chargement de votre espace de parrainage…</p> : <>
        <div className="mt-5 space-y-3">
          {workspace.codes.map(code => (
            <div key={code.code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div>
                <p className="font-mono text-lg font-black tracking-wider text-[#D4AF37]">{code.code}</p>
                <p className="mt-1 text-xs text-white/50">Statut : {codeStatus(code.status)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void copyLink(code.code)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/5">
                  {copiedCode === code.code ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} Copier
                </button>
                <button type="button" onClick={() => void shareLink(code.code)} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-sm font-black text-black"><Share2 className="h-4 w-4" /> Partager</button>
              </div>
            </div>
          ))}
          {workspace.codes.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">Aucun code de parrainage actif n’est disponible pour ce compte.</p>}
        </div>
        {credits.length > 0 && <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Mes crédits</p><div className="mt-2 flex flex-wrap gap-2">{credits.map(credit => <span key={credit.currency} className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-bold text-[#f5dfa0]">{creditLabel(credit)}{credit.pending ? ' · inclut un montant en attente' : ''}</span>)}</div></div>}
        {workspace.attribution && <p className="mt-5 text-sm text-white/55">Code invité enregistré : <span className="font-mono font-bold text-white">{workspace.attribution.code}</span>. Il sera pris en compte si votre première réservation est terminée.</p>}
      </>}
    </section>
  );
}
