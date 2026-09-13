import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  appendReferralWorkspaceHistory,
  creditLabel,
  createMyReferralCode,
  getMyReferralWorkspace,
  getPublicReferralCode,
  hasShareableReferralCode,
  isActiveReferralCode,
  isShareableReferralCode,
  referralCreditSummary,
  referralLink,
  referralCodeScopeForSurface,
  referralWorkspaceCanShare,
  referralWorkspaceMatchesSelection,
  runWithReferralActionLock,
  type ReferralCode,
  type ReferralSurface,
  type ReferralWorkspace,
} from '../../lib/marketplace/referrals';

interface ReferralCardProps {
  title: string;
  description: string;
  surface: ReferralSurface;
  brandId?: string | null;
}

type HistoryRole = 'inviter' | 'invitee';
const HISTORY_PAGE_SIZE = 10;

function codeStatus(status: string): string {
  if (status === 'active') return 'Actif';
  if (status === 'paused') return 'En pause';
  if (status === 'archived') return 'Archivé';
  return status;
}

function rewardStatus(status: string): string {
  if (status === 'approved') return 'Crédit accordé';
  if (status === 'pending') return 'En attente';
  if (status === 'rejected') return 'Refusé';
  return 'Annulé';
}

function currentReferralCode(workspace: ReferralWorkspace | null): ReferralCode | null {
  if (workspace?.state !== 'ready' || workspace.summary.state !== 'verified' || !workspace.summary.currentCode) return null;
  return { ...workspace.summary.currentCode, ownerType: workspace.summary.ownerType };
}

export default function ReferralCard({ title, description, surface, brandId }: ReferralCardProps) {
  const [workspace, setWorkspace] = useState<ReferralWorkspace | null>(null);
  const [historyRole, setHistoryRole] = useState<HistoryRole>('inviter');
  const [error, setError] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [verifiedCodes, setVerifiedCodes] = useState<Record<string, boolean>>({});
  const [verifyingCode, setVerifyingCode] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const activeAction = useRef<string | null>(null);
  const selectedScope = useMemo(() => referralCodeScopeForSurface(surface, brandId), [brandId, surface]);
  const selectedScopeRef = useRef(selectedScope);
  const historyRoleRef = useRef<HistoryRole>(historyRole);
  selectedScopeRef.current = selectedScope;
  historyRoleRef.current = historyRole;

  const fetchWorkspace = useCallback(async (role: HistoryRole, pageToken?: string) => {
    if (!selectedScope) return null;
    const nextWorkspace = await getMyReferralWorkspace({
      scope: selectedScope,
      role,
      limit: HISTORY_PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });
    const code = currentReferralCode(nextWorkspace);
    if (!code) return { workspace: nextWorkspace, verifiedCodes: {} };
    try {
      const verified = await getPublicReferralCode(code.code);
      return { workspace: nextWorkspace, verifiedCodes: { [code.code]: isShareableReferralCode(code, verified) } };
    } catch {
      return { workspace: nextWorkspace, verifiedCodes: { [code.code]: false } };
    }
  }, [selectedScope]);

  const loadWorkspace = useCallback(async (role: HistoryRole) => {
    if (selectedScopeRef.current !== selectedScope || historyRoleRef.current !== role) return false;
    const request = ++requestVersion.current;
    try {
      const result = await fetchWorkspace(role);
      if (!result || !mounted.current || request !== requestVersion.current
        || selectedScopeRef.current !== selectedScope || historyRoleRef.current !== role
        || !selectedScope || !referralWorkspaceMatchesSelection(result.workspace, selectedScope, role)) return false;
      setWorkspace(result.workspace);
      setVerifiedCodes(result.verifiedCodes);
      setError(false);
      return true;
    } catch {
      if (mounted.current && request === requestVersion.current
        && selectedScopeRef.current === selectedScope && historyRoleRef.current === role) {
        setWorkspace(null);
        setVerifiedCodes({});
        setError(true);
      }
      return false;
    }
  }, [fetchWorkspace]);

  useEffect(() => {
    mounted.current = true;
    setWorkspace(null);
    setVerifiedCodes({});
    setCopiedCode(null);
    setVerifyingCode(null);
    setError(false);
    setLoadingMore(false);
    historyRoleRef.current = 'inviter';
    setHistoryRole('inviter');
    if (selectedScope) void loadWorkspace('inviter');
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, [loadWorkspace, selectedScope]);

  const changeHistoryRole = (role: HistoryRole) => {
    if (role === historyRole) return;
    historyRoleRef.current = role;
    setHistoryRole(role);
    setWorkspace(null);
    setVerifiedCodes({});
    setCopiedCode(null);
    setVerifyingCode(null);
    setError(false);
    setLoadingMore(false);
    void loadWorkspace(role);
  };

  const displayWorkspace = workspace && selectedScope
    && referralWorkspaceMatchesSelection(workspace, selectedScope, historyRole)
    ? workspace
    : null;
  const displayWorkspaceRef = useRef<ReferralWorkspace | null>(displayWorkspace);
  displayWorkspaceRef.current = displayWorkspace;

  const loadMore = async () => {
    const pageToken = displayWorkspace?.history.nextPageToken;
    if (!displayWorkspace || !pageToken || loadingMore) return;
    const current = displayWorkspace;
    const request = ++requestVersion.current;
    setLoadingMore(true);
    try {
      const result = await fetchWorkspace(current.history.role, pageToken);
      if (!result || !mounted.current || request !== requestVersion.current
        || !selectedScopeRef.current || historyRoleRef.current !== current.history.role
        || !referralWorkspaceMatchesSelection(result.workspace, selectedScopeRef.current, historyRoleRef.current)) return;
      setWorkspace(appendReferralWorkspaceHistory(current, result.workspace));
      setVerifiedCodes(result.verifiedCodes);
    } catch {
      if (mounted.current && request === requestVersion.current
        && selectedScopeRef.current && historyRoleRef.current === current.history.role
        && referralWorkspaceMatchesSelection(current, selectedScopeRef.current, historyRoleRef.current)) {
        toast.error('Impossible de charger la suite de l’historique. Réessayez.');
      }
    } finally {
      if (mounted.current && request === requestVersion.current) setLoadingMore(false);
    }
  };

  const code = currentReferralCode(displayWorkspace);
  const codes = code ? [code] : [];
  const isReady = displayWorkspace?.state === 'ready';
  const isVerifiedSummary = isReady && displayWorkspace.summary.state === 'verified';
  const roleSummary = isVerifiedSummary ? displayWorkspace.summary[historyRole] : null;
  const credits = useMemo(() => referralCreditSummary(roleSummary?.creditTotals ?? []), [roleSummary]);
  const canCreate = Boolean(selectedScope && isReady);

  const createCode = async () => {
    if (!selectedScope || !canCreate) return;
    const scopeAtStart = selectedScope;
    const roleAtStart = historyRole;
    setCreatingCode(true);
    try {
      const result = await createMyReferralCode(scopeAtStart);
      if (selectedScopeRef.current !== scopeAtStart || historyRoleRef.current !== roleAtStart) return;
      await loadWorkspace(roleAtStart);
      toast.success(result.reused ? 'Votre lien de parrainage est disponible.' : 'Votre lien de parrainage est prêt.');
    } catch {
      toast.error('Impossible de créer ce lien pour cet espace. Vérifiez votre session, vos droits et réessayez.');
    } finally {
      if (mounted.current) setCreatingCode(false);
    }
  };

  const useVerifiedLink = async (codeValue: string, action: 'copy' | 'share') => {
    if (!selectedScope) return;
    const scopeAtStart = selectedScope;
    const roleAtStart = historyRole;
    const selectionIsCurrent = () => mounted.current && referralWorkspaceCanShare(
      displayWorkspaceRef.current,
      scopeAtStart,
      roleAtStart,
      codeValue,
    );
    await runWithReferralActionLock(activeAction, codeValue, async () => {
      setVerifyingCode(codeValue);
      const referralCode = codes.find(item => item.code === codeValue);
      try {
        try {
          const verified = await getPublicReferralCode(codeValue);
          if (!selectionIsCurrent()) return;
          if (!referralCode || !isShareableReferralCode(referralCode, verified)) {
            if (mounted.current) setVerifiedCodes(current => ({ ...current, [codeValue]: false }));
            toast.error('Ce lien de parrainage n’est plus disponible.');
            return;
          }
        } catch {
          if (!selectionIsCurrent()) return;
          if (mounted.current) setVerifiedCodes(current => ({ ...current, [codeValue]: false }));
          toast.error('Ce lien de parrainage n’est plus disponible.');
          return;
        }
        try {
          const link = referralLink(window.location.origin, codeValue);
          if (action === 'share' && navigator.share) {
            if (!selectionIsCurrent()) return;
            await navigator.share({ title: 'Barberboard', text: 'Utilisez mon lien de parrainage Barberboard.', url: link });
            return;
          }
          if (!navigator.clipboard) {
            toast.error('Le presse-papiers n’est pas disponible sur cet appareil.');
            return;
          }
          if (!selectionIsCurrent()) return;
          await navigator.clipboard.writeText(link);
          if (!selectionIsCurrent()) return;
          if (mounted.current) setCopiedCode(codeValue);
          toast.success('Lien de parrainage copié.');
        } catch (reason) {
          if (!selectionIsCurrent()) return;
          if ((reason as DOMException).name !== 'AbortError') toast.error(action === 'share' ? 'Le partage est indisponible pour le moment.' : 'Impossible de copier le lien de parrainage.');
        }
      } finally {
        if (mounted.current && selectionIsCurrent()) setVerifyingCode(null);
      }
    });
  };

  return (
    <section className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#1b170b] to-[#111] p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#D4AF37] text-black"><Gift className="h-5 w-5" /></span>
        <div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-white/55">{description}</p></div>
      </div>
      <p className="mt-4 text-sm text-[#f5dfa0]">Le crédit est accordé après le premier rendez-vous terminé de la personne invitée.</p>

      {!selectedScope ? <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">Sélectionnez une marque pour ouvrir son espace de parrainage.</p> : error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">Votre espace de parrainage ne peut pas être chargé pour le moment.</p> : displayWorkspace === null ? <p className="mt-4 text-sm text-white/50">Chargement de votre espace de parrainage…</p> : displayWorkspace.state === 'migrationRequired' ? <p role="status" className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Cet espace est en cours de migration. Les codes, crédits et historiques restent masqués jusqu’à la fin de la migration.</p> : <>
        {displayWorkspace.summary.state === 'unavailable' ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-sm text-white/60">Le résumé vérifié de cet espace n’est pas encore disponible. Aucune ancienne donnée n’est affichée.</p>{canCreate && <button type="button" disabled={creatingCode} onClick={() => void createCode()} className="mt-3 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{creatingCode ? 'Initialisation…' : 'Créer mon lien de parrainage'}</button>}</div> : <>
          <div className="mt-5 space-y-3">
            {code && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-4"><div><p className="font-mono text-lg font-black tracking-wider text-[#D4AF37]">{code.code}</p><p className="mt-1 text-xs text-white/50">Statut : {codeStatus(code.status)}</p></div>{verifiedCodes[code.code] ? <div className="flex gap-2"><button type="button" disabled={verifyingCode !== null} onClick={() => void useVerifiedLink(code.code, 'copy')} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/5 disabled:opacity-50">{copiedCode === code.code ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} Copier</button><button type="button" disabled={verifyingCode !== null} onClick={() => void useVerifiedLink(code.code, 'share')} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-sm font-black text-black disabled:opacity-50"><Share2 className="h-4 w-4" /> {verifyingCode === code.code ? 'Vérification…' : 'Partager'}</button></div> : <p className="text-sm text-white/45">{isActiveReferralCode(code.status) ? 'Le programme de ce code est indisponible pour le moment.' : 'Ce code ne peut pas être partagé tant qu’il n’est pas actif.'}</p>}</div>}
            {!hasShareableReferralCode(codes, verifiedCodes) && <div className="rounded-2xl border border-dashed border-white/15 p-4"><p className="text-sm text-white/50">Aucun lien actuellement partageable n’est disponible pour cet espace. Créez ou récupérez le lien du programme en cours.</p>{canCreate && <button type="button" disabled={creatingCode} onClick={() => void createCode()} className="mt-3 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{creatingCode ? 'Création du lien…' : 'Créer mon lien de parrainage'}</button>}</div>}
          </div>

          {surface === 'client' && <div className="mt-5 flex gap-2 border-t border-white/10 pt-4" aria-label="Type d’historique"><button type="button" onClick={() => changeHistoryRole('inviter')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${historyRole === 'inviter' ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-white/60'}`}>Parrainages envoyés</button><button type="button" onClick={() => changeHistoryRole('invitee')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${historyRole === 'invitee' ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-white/60'}`}>Avantages reçus</button></div>}

          <div className={`${surface === 'client' ? 'mt-4' : 'mt-5 border-t border-white/10 pt-4'}`}><p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">{historyRole === 'inviter' ? 'Crédits de parrainage' : 'Avantages reçus'}</p>{credits.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{credits.map(credit => <span key={credit.currency} className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-bold text-[#f5dfa0]">{creditLabel(credit)}{credit.pendingMinor > 0 ? ' · inclut un montant en attente' : ''}</span>)}</div> : <p className="mt-2 text-sm text-white/45">Aucun crédit vérifié pour le moment.</p>}{roleSummary && <p className="mt-2 text-xs text-white/40">{roleSummary.approvedCount} accordé(s) · {roleSummary.pendingCount} en attente · {roleSummary.rejectedCount + roleSummary.cancelledCount} non crédité(s)</p>}</div>

          <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Historique vérifié</p>{displayWorkspace.history.items.length === 0 ? <p className="mt-2 text-sm text-white/45">Aucun élément dans cet historique pour le moment.</p> : <div className="mt-2 space-y-2">{displayWorkspace.history.items.map(item => <div key={`${item.role}-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"><div><p className="font-bold text-white/75">{rewardStatus(item.status)}</p>{item.createdAt && <p className="text-xs text-white/35">{new Intl.DateTimeFormat('fr-FR').format(new Date(item.createdAt))}</p>}</div><span className="font-bold text-[#f5dfa0]">{creditLabel(item)}</span></div>)}</div>}{displayWorkspace.history.truncated && displayWorkspace.history.nextPageToken && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-3 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white/70 disabled:opacity-50">{loadingMore ? 'Chargement…' : 'Charger la suite'}</button>}</div>

          {surface === 'client' && displayWorkspace.attribution && <p className="mt-5 text-sm text-white/55">Code invité enregistré : <span className="font-mono font-bold text-white">{displayWorkspace.attribution.code}</span>. Il sera pris en compte si votre première réservation est terminée.</p>}
        </>}
      </>}
    </section>
  );
}
