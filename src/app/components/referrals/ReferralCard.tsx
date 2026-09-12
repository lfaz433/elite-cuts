import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  creditLabel,
  createMyReferralCode,
  getMyReferralWorkspace,
  getPublicReferralCode,
  isActiveReferralCode,
  isShareableReferralCode,
  referralLink,
  referralCodeScopeForSurface,
  referralWorkspaceForScope,
  type ReferralSurface,
  type ReferralWorkspace,
  type ReferralWorkspaceScope,
} from '../../lib/marketplace/referrals';

interface ReferralCardProps {
  title: string;
  description: string;
  surface: ReferralSurface;
  brandId?: string | null;
}

function codeStatus(status: string): string {
  if (status === 'active') return 'Actif';
  if (status === 'paused') return 'En pause';
  if (status === 'archived') return 'Archivé';
  return status;
}

function creditSummary(workspace: ReferralWorkspaceScope): Array<{ currency: string; amountMinor: number; pending: boolean }> {
  if (workspace.creditTotals) {
    return workspace.creditTotals.map(total => ({
      currency: total.currency,
      amountMinor: total.approvedMinor + total.pendingMinor,
      pending: total.pendingMinor > 0,
    }));
  }
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

export default function ReferralCard({ title, description, surface, brandId }: ReferralCardProps) {
  const [workspace, setWorkspace] = useState<ReferralWorkspace | null>(null);
  const [error, setError] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [verifiedCodes, setVerifiedCodes] = useState<Record<string, boolean>>({});
  const [verifyingCode, setVerifyingCode] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const activeAction = useRef<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    const nextWorkspace = await getMyReferralWorkspace();
    const scope = referralWorkspaceForScope(nextWorkspace, surface, brandId);
    const codes = scope.codes;
    const validation = await Promise.all(codes.map(async code => {
      try {
        const verified = await getPublicReferralCode(code.code);
        return [code.code, isShareableReferralCode(code, verified)] as const;
      } catch {
        return [code.code, false] as const;
      }
    }));
    return { workspace: nextWorkspace, verifiedCodes: Object.fromEntries(validation) };
  }, [brandId, surface]);

  const loadWorkspace = useCallback(async () => {
    const request = ++requestVersion.current;
    try {
      const result = await fetchWorkspace();
      if (!mounted.current || request !== requestVersion.current) return false;
      setWorkspace(result.workspace);
      setVerifiedCodes(result.verifiedCodes);
      setError(false);
      return true;
    } catch {
      if (mounted.current && request === requestVersion.current) setError(true);
      return false;
    }
  }, [fetchWorkspace]);

  useEffect(() => {
    mounted.current = true;
    setWorkspace(null);
    setVerifiedCodes({});
    void loadWorkspace();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, [loadWorkspace]);

  const activeScope = useMemo(() => workspace ? referralWorkspaceForScope(workspace, surface, brandId) : { codes: [], rewards: [] }, [brandId, surface, workspace]);
  const credits = useMemo(() => creditSummary(activeScope), [activeScope]);
  const codes = activeScope.codes;
  const creationScope = referralCodeScopeForSurface(surface, brandId);
  const hasAuthorizedBrandWorkspace = surface !== 'brand' || Boolean(
    brandId && workspace?.brandWorkspaces?.some(brand => brand.brandId === brandId),
  );
  const canCreate = Boolean(creationScope && hasAuthorizedBrandWorkspace);
  const createCode = async () => {
    if (!creationScope || !canCreate) return;
    setCreatingCode(true);
    try {
      const result = await createMyReferralCode(creationScope);
      await loadWorkspace();
      toast.success(result.reused ? 'Votre lien de parrainage est disponible.' : 'Votre lien de parrainage est prêt.');
    } catch {
      toast.error('Impossible de créer ce lien pour cet espace. Vérifiez votre session, vos droits et réessayez.');
    } finally {
      if (mounted.current) setCreatingCode(false);
    }
  };
  const useVerifiedLink = async (code: string, action: 'copy' | 'share') => {
    if (activeAction.current) return;
    activeAction.current = code;
    setVerifyingCode(code);
    const referralCode = codes.find(item => item.code === code);
    try {
      const verified = await getPublicReferralCode(code);
      if (!referralCode || !isShareableReferralCode(referralCode, verified)) {
        if (mounted.current) {
          setVerifiedCodes(current => ({ ...current, [code]: false }));
        }
        toast.error('Ce lien de parrainage n’est plus disponible.');
        return;
      }
    } catch {
      if (mounted.current) {
        setVerifiedCodes(current => ({ ...current, [code]: false }));
      }
      toast.error('Ce lien de parrainage n’est plus disponible.');
      return;
    }
    try {
      const link = referralLink(window.location.origin, code);
      if (action === 'share' && navigator.share) {
        await navigator.share({ title: 'Barberboard', text: 'Utilisez mon lien de parrainage Barberboard.', url: link });
        return;
      }
      if (!navigator.clipboard) {
        toast.error('Le presse-papiers n’est pas disponible sur cet appareil.');
        return;
      }
      await navigator.clipboard.writeText(link);
      if (mounted.current) setCopiedCode(code);
      toast.success('Lien de parrainage copié.');
    } catch (reason) {
      if ((reason as DOMException).name !== 'AbortError') {
        toast.error(action === 'share' ? 'Le partage est indisponible pour le moment.' : 'Impossible de copier le lien de parrainage.');
      }
    } finally {
      activeAction.current = null;
      if (mounted.current) setVerifyingCode(null);
    }
  };
  const copyLink = async (code: string) => {
    await useVerifiedLink(code, 'copy');
  };
  const shareLink = async (code: string) => {
    await useVerifiedLink(code, 'share');
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
          {codes.map(code => (
            <div key={code.code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div>
                <p className="font-mono text-lg font-black tracking-wider text-[#D4AF37]">{code.code}</p>
                <p className="mt-1 text-xs text-white/50">Statut : {codeStatus(code.status)}</p>
              </div>
              {verifiedCodes[code.code] ? <div className="flex gap-2">
                <button type="button" disabled={verifyingCode !== null} onClick={() => void copyLink(code.code)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/5 disabled:opacity-50">
                  {copiedCode === code.code ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} Copier
                </button>
                <button type="button" disabled={verifyingCode !== null} onClick={() => void shareLink(code.code)} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-sm font-black text-black disabled:opacity-50"><Share2 className="h-4 w-4" /> {verifyingCode === code.code ? 'Vérification…' : 'Partager'}</button>
              </div> : <p className="text-sm text-white/45">{isActiveReferralCode(code.status) ? 'Le programme de ce code est indisponible pour le moment.' : 'Ce code ne peut pas être partagé tant qu’il n’est pas actif.'}</p>}
            </div>
          ))}
          {(!codes.some(code => isActiveReferralCode(code.status))) && <div className="rounded-2xl border border-dashed border-white/15 p-4"><p className="text-sm text-white/50">{canCreate ? 'Créez votre lien de parrainage pour cet espace. Les règles d’éligibilité sont vérifiées côté serveur.' : surface === 'brand' && !brandId ? 'Sélectionnez une marque pour créer un lien de parrainage.' : 'Cet espace de marque n’est pas autorisé pour le parrainage.'}</p>{canCreate && <button type="button" disabled={creatingCode} onClick={() => void createCode()} className="mt-3 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{creatingCode ? 'Création du lien…' : 'Créer mon lien de parrainage'}</button>}</div>}
        </div>
        {credits.length > 0 && <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Mes crédits</p><div className="mt-2 flex flex-wrap gap-2">{credits.map(credit => <span key={credit.currency} className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-bold text-[#f5dfa0]">{creditLabel(credit)}{credit.pending ? ' · inclut un montant en attente' : ''}</span>)}</div></div>}
        {surface === 'client' && activeScope.attribution && <p className="mt-5 text-sm text-white/55">Code invité enregistré : <span className="font-mono font-bold text-white">{activeScope.attribution.code}</span>. Il sera pris en compte si votre première réservation est terminée.</p>}
      </>}
    </section>
  );
}
