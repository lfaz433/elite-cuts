import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Pause, Play, RefreshCw, XCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { functions } from '../../lib/firebase';

type ProgramStatus = 'active' | 'paused' | 'draft' | 'archived';
type ReviewDecision = 'approve' | 'reject';

interface ReferralProgram {
  id: string;
  status: ProgramStatus;
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: unknown;
  endsAt: unknown;
}

interface PendingReward {
  id: string;
  programId: string;
  bookingId: string;
  inviterId: string;
  invitedUserId: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  currency: string;
  status: 'pending';
  createdAt?: unknown;
}

interface ReferralMarketingOverview {
  programs: ReferralProgram[];
  funnel: { codes: number; attributions: number; rewards: number; pending: number; approved: number; rejected: number };
  topReferrers: Array<{ inviterId: string; referrals: number; rewards: number; approvedCreditsMinor: number; currency: string }>;
  pendingRewards: PendingReward[];
}

const getReferralMarketingOverviewCall = httpsCallable<Record<string, never>, unknown>(functions, 'getReferralMarketingOverview');
const createReferralProgramCall = httpsCallable<Record<string, unknown>, unknown>(functions, 'createReferralProgram');
const reviewReferralRewardCall = httpsCallable<{ rewardId: string; decision: ReviewDecision; reason?: string }, unknown>(functions, 'reviewReferralReward');

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function parseProgram(value: unknown): ReferralProgram | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== 'string' || !['active', 'paused', 'draft', 'archived'].includes(String(candidate.status))
    || !Array.isArray(candidate.countryCodes) || !candidate.countryCodes.every(country => typeof country === 'string')
    || typeof candidate.currency !== 'string') return null;
  const inviterCreditMinor = nonNegativeInteger(candidate.inviterCreditMinor);
  const invitedDiscountMinor = nonNegativeInteger(candidate.invitedDiscountMinor);
  if (inviterCreditMinor === null || invitedDiscountMinor === null || candidate.startsAt === undefined || candidate.endsAt === undefined) return null;
  return { id: candidate.id, status: candidate.status as ProgramStatus, countryCodes: candidate.countryCodes, currency: candidate.currency, inviterCreditMinor, invitedDiscountMinor, startsAt: candidate.startsAt, endsAt: candidate.endsAt };
}

function parsePendingReward(value: unknown): PendingReward | null {
  const candidate = record(value);
  if (!candidate || candidate.status !== 'pending' || ['id', 'programId', 'bookingId', 'inviterId', 'invitedUserId', 'currency'].some(key => typeof candidate[key] !== 'string')) return null;
  const inviterCreditMinor = nonNegativeInteger(candidate.inviterCreditMinor);
  const invitedDiscountMinor = nonNegativeInteger(candidate.invitedDiscountMinor);
  if (inviterCreditMinor === null || invitedDiscountMinor === null) return null;
  return {
    id: candidate.id as string, programId: candidate.programId as string, bookingId: candidate.bookingId as string,
    inviterId: candidate.inviterId as string, invitedUserId: candidate.invitedUserId as string,
    inviterCreditMinor, invitedDiscountMinor, currency: candidate.currency as string, status: 'pending',
    ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt }),
  };
}

function parseOverview(value: unknown): ReferralMarketingOverview | null {
  const candidate = record(value);
  const funnel = candidate && record(candidate.funnel);
  if (!candidate || !funnel || !Array.isArray(candidate.programs) || !Array.isArray(candidate.topReferrers) || !Array.isArray(candidate.pendingRewards)) return null;
  const counts = ['codes', 'attributions', 'rewards', 'pending', 'approved', 'rejected'].map(key => nonNegativeInteger(funnel[key]));
  if (counts.some(count => count === null)) return null;
  const topReferrers = candidate.topReferrers.flatMap(value => {
    const referrer = record(value);
    const referrals = referrer && nonNegativeInteger(referrer.referrals);
    const rewards = referrer && nonNegativeInteger(referrer.rewards);
    const approvedCreditsMinor = referrer && nonNegativeInteger(referrer.approvedCreditsMinor);
    return referrer && typeof referrer.inviterId === 'string' && typeof referrer.currency === 'string'
      && referrals !== null && rewards !== null && approvedCreditsMinor !== null
      ? [{ inviterId: referrer.inviterId, referrals, rewards, approvedCreditsMinor, currency: referrer.currency }]
      : [];
  });
  return {
    programs: candidate.programs.map(parseProgram).filter((program): program is ReferralProgram => program !== null),
    funnel: { codes: counts[0] as number, attributions: counts[1] as number, rewards: counts[2] as number, pending: counts[3] as number, approved: counts[4] as number, rejected: counts[5] as number },
    topReferrers,
    pendingRewards: candidate.pendingRewards.map(parsePendingReward).filter((reward): reward is PendingReward => reward !== null),
  };
}

export function funnelRate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export function rewardBadge(status: string): string {
  if (status === 'pending') return 'À examiner';
  if (status === 'approved') return 'Crédit accordé';
  if (status === 'rejected') return 'Refusé';
  return status;
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amountMinor / 100);
}

function timestampText(value: unknown): string {
  const candidate = record(value);
  const seconds = candidate && typeof candidate.seconds === 'number' ? candidate.seconds * 1000 : undefined;
  const date = new Date(typeof value === 'number' || typeof value === 'string' ? value : seconds ?? NaN);
  return Number.isNaN(date.getTime()) ? 'Date indisponible' : date.toLocaleDateString('fr-FR');
}

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function ReferralMarketingDashboard() {
  const [overview, setOverview] = useState<ReferralMarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programStatus, setProgramStatus] = useState<Extract<ProgramStatus, 'active' | 'paused'>>('active');
  const [inviterCredit, setInviterCredit] = useState('5');
  const [invitedDiscount, setInvitedDiscount] = useState('3');
  const [startsAt, setStartsAt] = useState(isoDate(0));
  const [endsAt, setEndsAt] = useState(isoDate(365));
  const [savingProgram, setSavingProgram] = useState(false);
  const [reviewingRewardId, setReviewingRewardId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const selectedProgram = useMemo(() => overview?.programs.find(program => program.id === selectedProgramId) ?? null, [overview, selectedProgramId]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const result = await getReferralMarketingOverviewCall({});
      const nextOverview = parseOverview(result.data);
      if (!nextOverview) throw new Error('Invalid referral marketing overview');
      setOverview(nextOverview);
      setError(false);
    } catch (reason) {
      console.error('Unable to load referral marketing overview', reason);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadOverview(); }, []);

  const selectProgram = (programId: string) => {
    setSelectedProgramId(programId);
    const program = overview?.programs.find(item => item.id === programId);
    if (!program) return;
    setProgramStatus(program.status === 'active' ? 'active' : 'paused');
    setInviterCredit((program.inviterCreditMinor / 100).toFixed(2));
    setInvitedDiscount((program.invitedDiscountMinor / 100).toFixed(2));
    setStartsAt(timestampText(program.startsAt).split('/').reverse().join('-'));
    setEndsAt(timestampText(program.endsAt).split('/').reverse().join('-'));
  };

  const saveProgram = async (event: React.FormEvent) => {
    event.preventDefault();
    const inviterCreditMinor = Math.round(Number(inviterCredit) * 100);
    const invitedDiscountMinor = Math.round(Number(invitedDiscount) * 100);
    if (!Number.isSafeInteger(inviterCreditMinor) || inviterCreditMinor < 0 || inviterCreditMinor > 1_000_000
      || !Number.isSafeInteger(invitedDiscountMinor) || invitedDiscountMinor < 0 || invitedDiscountMinor > 1_000_000
      || !startsAt || !endsAt) {
      toast.error('Saisissez des crédits positifs et des dates valides.');
      return;
    }
    setSavingProgram(true);
    try {
      await createReferralProgramCall({
        ...(selectedProgramId ? { programId: selectedProgramId } : {}),
        status: programStatus,
        countryCodes: ['FR'],
        currency: 'EUR',
        inviterCreditMinor,
        invitedDiscountMinor,
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: `${endsAt}T23:59:59.999Z`,
      });
      toast.success(programStatus === 'active' ? 'Programme de crédits activé.' : 'Programme de crédits mis en pause.');
      await loadOverview();
    } catch (reason) {
      console.error('Unable to save referral program', reason);
      toast.error('Impossible d’enregistrer ce programme.');
    } finally {
      setSavingProgram(false);
    }
  };

  const reviewReward = async (rewardId: string, decision: ReviewDecision) => {
    const reason = rejectionReasons[rewardId]?.trim();
    if (decision === 'reject' && !reason) {
      toast.error('Un motif est requis pour refuser un crédit.');
      return;
    }
    setReviewingRewardId(rewardId);
    try {
      await reviewReferralRewardCall({ rewardId, decision, ...(decision === 'reject' ? { reason } : {}) });
      toast.success(decision === 'approve' ? 'Crédit plateforme accordé après revue.' : 'Crédit refusé avec motif.');
      await loadOverview();
    } catch (reason) {
      console.error('Unable to review referral reward', reason);
      toast.error('La revue du crédit a échoué.');
    } finally {
      setReviewingRewardId(null);
    }
  };

  const metrics = overview ? [
    { label: 'Codes réservés', value: overview.funnel.codes, detail: 'Base du funnel' },
    { label: 'Inscriptions attribuées', value: overview.funnel.attributions, detail: `${funnelRate(overview.funnel.attributions, overview.funnel.codes)} % des codes` },
    { label: 'Premiers rendez-vous', value: overview.funnel.rewards, detail: `${funnelRate(overview.funnel.rewards, overview.funnel.attributions)} % des attributions` },
    { label: 'À examiner', value: overview.funnel.pending, detail: 'Crédits en attente de revue' },
  ] : [];

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#201b0a] to-[#111] p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div><h2 className="text-2xl font-black">Marketing &amp; parrainage</h2><p className="mt-1 text-sm text-white/60">Funnel, campagnes France et revue manuelle des crédits.</p></div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Actualiser</button>
        </div>
        <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Chaque attribution reste soumise à une revue manuelle. Une approbation crée uniquement un crédit plateforme en EUR — aucun paiement ni transfert de fonds.</p>
      </div>

      {error ? <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">Les données de parrainage ne peuvent pas être chargées. Vérifiez vos droits Super Admin puis réessayez.</div> : loading && !overview ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}</div> : overview && <>
        <div className="grid gap-4 md:grid-cols-4">{metrics.map(metric => <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs font-bold uppercase tracking-wider text-white/45">{metric.label}</p><p className="mt-2 text-3xl font-black text-[#D4AF37]">{metric.value}</p><p className="mt-1 text-xs text-white/50">{metric.detail}</p></div>)}</div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <form onSubmit={saveProgram} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <div><h3 className="text-lg font-black">Programme France</h3><p className="mt-1 text-sm text-white/55">EUR uniquement, avec crédits fixes pour l’invitant et la personne invitée.</p></div>
            <label className="block text-sm font-bold text-white/70">Programme<select value={selectedProgramId} onChange={event => selectProgram(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white"><option value="">Nouveau programme</option>{overview.programs.map(program => <option key={program.id} value={program.id}>{program.id} · {program.status}</option>)}</select></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-white/70">Crédit invitant (EUR)<input required min="0" step="0.01" type="number" value={inviterCredit} onChange={event => setInviterCredit(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" /></label><label className="block text-sm font-bold text-white/70">Réduction invité (EUR)<input required min="0" step="0.01" type="number" value={invitedDiscount} onChange={event => setInvitedDiscount(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" /></label></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-white/70">Début<input required type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" /></label><label className="block text-sm font-bold text-white/70">Fin<input required type="date" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" /></label></div>
            <label className="block text-sm font-bold text-white/70">Statut<select value={programStatus} onChange={event => setProgramStatus(event.target.value as Extract<ProgramStatus, 'active' | 'paused'>)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white"><option value="active">Actif</option><option value="paused">En pause</option></select></label>
            <button disabled={savingProgram} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{programStatus === 'active' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{savingProgram ? 'Enregistrement…' : selectedProgram ? 'Mettre à jour' : 'Créer le programme'}</button>
          </form>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><h3 className="text-lg font-black">Meilleurs prescripteurs</h3><p className="mt-1 text-sm text-white/55">Classement par inscriptions attribuées, sans estimation de revenu.</p><div className="mt-4 space-y-3">{overview.topReferrers.map((referrer, index) => <div key={referrer.inviterId} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><div><p className="text-sm font-black text-white">#{index + 1} · {referrer.inviterId}</p><p className="text-xs text-white/45">{referrer.referrals} attribution(s) · {referrer.rewards} rendez-vous</p></div><p className="text-sm font-bold text-[#f5dfa0]">{money(referrer.approvedCreditsMinor, referrer.currency)}</p></div>)}{overview.topReferrers.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">Aucune attribution à classer pour le moment.</p>}</div></div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#D4AF37]" /><div><h3 className="text-lg font-black">File de revue manuelle</h3><p className="text-sm text-white/55">Validez les crédits plateforme uniquement après contrôle.</p></div></div><div className="mt-5 space-y-4">{overview.pendingRewards.map(reward => <article key={reward.id} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="font-black text-white">{rewardBadge(reward.status)} · {reward.id}</p><p className="mt-1 text-sm text-white/55">Invitant : {reward.inviterId} · Invité : {reward.invitedUserId}</p><p className="mt-1 text-xs text-white/40">Réservation {reward.bookingId} · {timestampText(reward.createdAt)}</p></div><div className="text-left md:text-right"><p className="font-bold text-[#f5dfa0]">{money(reward.inviterCreditMinor, reward.currency)} + {money(reward.invitedDiscountMinor, reward.currency)}</p><p className="text-xs text-white/45">crédits plateforme proposés</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={rejectionReasons[reward.id] ?? ''} onChange={event => setRejectionReasons(current => ({ ...current, [reward.id]: event.target.value }))} maxLength={500} placeholder="Motif requis en cas de refus" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35" /><button type="button" disabled={reviewingRewardId === reward.id} onClick={() => void reviewReward(reward.id, 'reject')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/30 px-3 py-2 text-sm font-bold text-rose-200 disabled:opacity-50"><XCircle className="h-4 w-4" /> Refuser</button><button type="button" disabled={reviewingRewardId === reward.id} onClick={() => void reviewReward(reward.id, 'approve')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-sm font-black text-black disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Accorder le crédit</button></div></article>)}{overview.pendingRewards.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">Aucun crédit ne nécessite de revue manuelle.</p>}</div></div>
      </>}
    </section>
  );
}
