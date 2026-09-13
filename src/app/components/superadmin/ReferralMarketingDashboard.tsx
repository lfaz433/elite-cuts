import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flag,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { functions } from '../../lib/firebase';

type Owner = 'client' | 'freelancer' | 'brand';
type ProgramStatus = 'draft' | 'active' | 'paused' | 'archived';
type ReviewAction = 'approve' | 'reject' | 'flag' | 'clear';
type AuditFilterKind = 'code' | 'programId' | 'rewardId' | 'action';
type PageKind = 'programs' | 'pendingRewards' | 'flaggedRewards' | 'auditTrail';
type RequestKind = 'overview' | 'initializer' | PageKind;
type Credit = { currency: string; amountMinor: number };
type Telemetry = { state: 'verified' | 'unavailable'; validatedVisits: number; capped: boolean };
type FraudFlag = { status: 'flagged' | 'cleared'; reason: string };
type Program = {
  id: string;
  status: ProgramStatus;
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: string;
  endsAt: string;
};
type Reward = {
  id: string;
  programId: string;
  bookingId: string;
  inviterId: string;
  invitedUserId: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  currency: string;
  status: 'pending';
  createdAt?: string;
  fraudFlag?: FraudFlag;
};
type Audit = {
  id: string;
  action: string;
  programId?: string;
  rewardId?: string;
  code?: string;
  actorUid?: string;
  reason?: string;
  createdAt?: string;
};

type OverviewPage<T> = {
  items: T[];
  nextPageToken?: string;
  truncated: boolean;
};
type TopReferrer = {
  inviterId: string;
  inviterOwnerType: Owner;
  referrals: number;
  rewards: number;
  approvedCreditTotals: Credit[];
};

export type ReferralMarketingOverview = {
  contractVersion: 3;
  state: 'ready' | 'migrationRequired';
  summaryEpoch: 'referral-v3';
  telemetry: Telemetry;
  programs: OverviewPage<Program>;
  funnel: {
    codes: number;
    validatedVisits: number;
    attributions: number;
    attributedSignups: number;
    rewards: number;
    eligibleFirstBookings: number;
    pending: number;
    pendingRewards: number;
    approved: number;
    approvedRewards: number;
    rejected: number;
    cancelled: number;
  };
  approvedCreditTotals: Credit[];
  topReferrers: OverviewPage<TopReferrer>;
  pendingRewards: OverviewPage<Reward>;
  flaggedRewards: OverviewPage<Reward & { fraudFlag: { status: 'flagged'; reason: string } }>;
  auditTrail: OverviewPage<Audit>;
};

const overviewCall = httpsCallable<Record<string, unknown>, unknown>(functions, 'getReferralMarketingOverview');
const initializeCall = httpsCallable<Record<string, never>, unknown>(functions, 'initializeReferralMarketingV3');
const createProgramCall = httpsCallable<Record<string, unknown>, unknown>(functions, 'createReferralProgram');
const reviewCall = httpsCallable<
  { rewardId: string; decision: 'approve' | 'reject'; reason?: string },
  unknown
>(functions, 'reviewReferralReward');
const flagCall = httpsCallable<
  { rewardId: string; flagged: boolean; reason: string },
  unknown
>(functions, 'setReferralRewardFlag');

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const ACTION_PATTERN = /^REFERRAL_[A-Z_]{3,64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_REASON_LENGTH = 500;
const MAX_AUDIT_RESULTS = 50;
const MAX_OVERVIEW_RESULTS = 20;
const TOP_REFERRER_RESULTS = 10;
const OVERVIEW_REQUEST = { programLimit: 10, pendingLimit: 10, flaggedLimit: 10, auditLimit: 20 } as const;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string'
    && ISO_DATE_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function parseCredit(value: unknown): Credit | null {
  const candidate = object(value);
  const amountMinor = candidate && nonNegativeInteger(candidate.amountMinor);
  if (!candidate || typeof candidate.currency !== 'string' || !CURRENCY_PATTERN.test(candidate.currency)
    || amountMinor === null) return null;
  return { currency: candidate.currency, amountMinor };
}

function parseCredits(value: unknown): Credit[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parseCredit);
  if (parsed.some(item => item === null)) return null;
  const credits = parsed as Credit[];
  if (new Set(credits.map(item => item.currency)).size !== credits.length) return null;
  return credits;
}

function parseProgram(value: unknown): Program | null {
  const candidate = object(value);
  const inviterCreditMinor = candidate && nonNegativeInteger(candidate.inviterCreditMinor);
  const invitedDiscountMinor = candidate && nonNegativeInteger(candidate.invitedDiscountMinor);
  if (
    !candidate
    || !nonEmptyString(candidate.id)
    || !['draft', 'active', 'paused', 'archived'].includes(String(candidate.status))
    || !Array.isArray(candidate.countryCodes)
    || candidate.countryCodes.length === 0
    || candidate.countryCodes.length > 25
    || !candidate.countryCodes.every(country => typeof country === 'string' && COUNTRY_PATTERN.test(country))
    || new Set(candidate.countryCodes).size !== candidate.countryCodes.length
    || typeof candidate.currency !== 'string'
    || !CURRENCY_PATTERN.test(candidate.currency)
    || inviterCreditMinor === null
    || invitedDiscountMinor === null
    || !isIsoDate(candidate.startsAt)
    || !isIsoDate(candidate.endsAt)
  ) return null;
  return {
    id: candidate.id,
    status: candidate.status as ProgramStatus,
    countryCodes: candidate.countryCodes as string[],
    currency: candidate.currency,
    inviterCreditMinor,
    invitedDiscountMinor,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
  };
}

function parseFraudFlag(value: unknown): FraudFlag | null {
  const candidate = object(value);
  if (!candidate || (candidate.status !== 'flagged' && candidate.status !== 'cleared')
    || typeof candidate.reason !== 'string'
    || candidate.reason.length === 0
    || candidate.reason.length > MAX_REASON_LENGTH
    || candidate.reason.trim() !== candidate.reason) return null;
  return { status: candidate.status, reason: candidate.reason };
}

function parseReward(value: unknown): Reward | null {
  const candidate = object(value);
  const inviterCreditMinor = candidate && nonNegativeInteger(candidate.inviterCreditMinor);
  const invitedDiscountMinor = candidate && nonNegativeInteger(candidate.invitedDiscountMinor);
  const fraudFlag = candidate?.fraudFlag === undefined ? undefined : parseFraudFlag(candidate.fraudFlag);
  if (
    !candidate
    || candidate.status !== 'pending'
    || !nonEmptyString(candidate.id)
    || !nonEmptyString(candidate.programId)
    || !nonEmptyString(candidate.bookingId)
    || !nonEmptyString(candidate.inviterId)
    || !nonEmptyString(candidate.invitedUserId)
    || inviterCreditMinor === null
    || invitedDiscountMinor === null
    || typeof candidate.currency !== 'string'
    || !CURRENCY_PATTERN.test(candidate.currency)
    || (candidate.createdAt !== undefined && !isIsoDate(candidate.createdAt))
    || (candidate.fraudFlag !== undefined && !fraudFlag)
  ) return null;
  return {
    id: candidate.id,
    programId: candidate.programId,
    bookingId: candidate.bookingId,
    inviterId: candidate.inviterId,
    invitedUserId: candidate.invitedUserId,
    inviterCreditMinor,
    invitedDiscountMinor,
    currency: candidate.currency,
    status: 'pending',
    ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt as string }),
    ...(fraudFlag ? { fraudFlag } : {}),
  };
}

function rewardsAreCanonicalMatches(left: Reward, right: Reward): boolean {
  return left.id === right.id
    && left.programId === right.programId
    && left.bookingId === right.bookingId
    && left.inviterId === right.inviterId
    && left.invitedUserId === right.invitedUserId
    && left.inviterCreditMinor === right.inviterCreditMinor
    && left.invitedDiscountMinor === right.invitedDiscountMinor
    && left.currency === right.currency
    && left.status === right.status
    && left.createdAt === right.createdAt
    && left.fraudFlag?.status === right.fraudFlag?.status
    && left.fraudFlag?.reason === right.fraudFlag?.reason;
}

function parseAudit(value: unknown): Audit | null {
  const candidate = object(value);
  if (
    !candidate
    || !nonEmptyString(candidate.id)
    || typeof candidate.action !== 'string'
    || !ACTION_PATTERN.test(candidate.action)
    || (candidate.programId !== undefined
      && (typeof candidate.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(candidate.programId)))
    || (candidate.rewardId !== undefined
      && (typeof candidate.rewardId !== 'string' || !DOCUMENT_ID_PATTERN.test(candidate.rewardId)))
    || (candidate.code !== undefined
      && (typeof candidate.code !== 'string' || !CODE_PATTERN.test(candidate.code)))
    || (candidate.actorUid !== undefined
      && (typeof candidate.actorUid !== 'string' || !DOCUMENT_ID_PATTERN.test(candidate.actorUid)))
    || (candidate.reason !== undefined
      && (typeof candidate.reason !== 'string' || candidate.reason.length === 0
        || candidate.reason.length > MAX_REASON_LENGTH))
    || (candidate.createdAt !== undefined && !isIsoDate(candidate.createdAt))
  ) return null;
  return {
    id: candidate.id,
    action: candidate.action,
    ...(candidate.programId === undefined ? {} : { programId: candidate.programId as string }),
    ...(candidate.rewardId === undefined ? {} : { rewardId: candidate.rewardId as string }),
    ...(candidate.code === undefined ? {} : { code: candidate.code as string }),
    ...(candidate.actorUid === undefined ? {} : { actorUid: candidate.actorUid as string }),
    ...(candidate.reason === undefined ? {} : { reason: candidate.reason as string }),
    ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt as string }),
  };
}

function parseTopReferrer(value: unknown): TopReferrer | null {
  const candidate = object(value);
  const inviterOwnerType = candidate?.inviterOwnerType;
  const referrals = candidate && nonNegativeInteger(candidate.referrals);
  const rewards = candidate && nonNegativeInteger(candidate.rewards);
  const approvedCreditTotals = candidate && parseCredits(candidate.approvedCreditTotals);
  if (
    !candidate
    || typeof candidate.inviterId !== 'string'
    || !DOCUMENT_ID_PATTERN.test(candidate.inviterId)
    || (inviterOwnerType !== 'client' && inviterOwnerType !== 'freelancer' && inviterOwnerType !== 'brand')
    || referrals === null
    || rewards === null
    || !approvedCreditTotals
  ) return null;
  return { inviterId: candidate.inviterId, inviterOwnerType, referrals, rewards, approvedCreditTotals };
}

function parseOverviewPage<T>(
  value: unknown,
  parseItem: (item: unknown) => T | null,
  maximum: number,
  pageable: boolean,
): OverviewPage<T> | null {
  const candidate = object(value);
  if (!candidate || !Array.isArray(candidate.items) || candidate.items.length > maximum
    || typeof candidate.truncated !== 'boolean') return null;
  const hasToken = candidate.nextPageToken !== undefined;
  if (hasToken && (typeof candidate.nextPageToken !== 'string'
    || !DOCUMENT_ID_PATTERN.test(candidate.nextPageToken))) return null;
  if (!pageable && hasToken) return null;
  if (pageable && candidate.truncated !== hasToken) return null;
  const items = candidate.items.map(parseItem);
  if (items.some(item => item === null)) return null;
  return {
    items: items as T[],
    ...(hasToken ? { nextPageToken: candidate.nextPageToken as string } : {}),
    truncated: candidate.truncated,
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

export function parseReferralMarketingOverview(value: unknown): ReferralMarketingOverview | null {
  const candidate = object(value);
  const funnel = candidate && object(candidate.funnel);
  const telemetry = candidate && object(candidate.telemetry);
  const funnelKeys = [
    'codes',
    'validatedVisits',
    'attributions',
    'attributedSignups',
    'rewards',
    'eligibleFirstBookings',
    'pending',
    'pendingRewards',
    'approved',
    'approvedRewards',
    'rejected',
    'cancelled',
  ] as const;
  if (
    !candidate
    || candidate.contractVersion !== 3
    || (candidate.state !== 'ready' && candidate.state !== 'migrationRequired')
    || candidate.summaryEpoch !== 'referral-v3'
    || !telemetry
    || (telemetry.state !== 'verified' && telemetry.state !== 'unavailable')
    || nonNegativeInteger(telemetry.validatedVisits) === null
    || typeof telemetry.capped !== 'boolean'
    || !funnel
    || funnelKeys.some(key => nonNegativeInteger(funnel[key]) === null)
  ) return null;

  const programs = parseOverviewPage(candidate.programs, parseProgram, MAX_OVERVIEW_RESULTS, true);
  const approvedCreditTotals = parseCredits(candidate.approvedCreditTotals);
  const topReferrers = parseOverviewPage(candidate.topReferrers, parseTopReferrer, TOP_REFERRER_RESULTS, false);
  const pendingRewards = parseOverviewPage(candidate.pendingRewards, parseReward, MAX_OVERVIEW_RESULTS, true);
  const flaggedRewards = parseOverviewPage(candidate.flaggedRewards, parseReward, MAX_OVERVIEW_RESULTS, true);
  const auditTrail = parseOverviewPage(candidate.auditTrail, parseAudit, MAX_AUDIT_RESULTS, true);

  if (
    !approvedCreditTotals
    || !programs
    || !topReferrers
    || !pendingRewards
    || !flaggedRewards
    || !auditTrail
    || flaggedRewards.items.some(item => item.fraudFlag?.status !== 'flagged')
  ) return null;

  const typedFunnel = Object.fromEntries(
    funnelKeys.map(key => [key, nonNegativeInteger(funnel[key])]),
  ) as ReferralMarketingOverview['funnel'];
  const typedTelemetry: Telemetry = {
    state: telemetry.state as Telemetry['state'],
    validatedVisits: telemetry.validatedVisits as number,
    capped: telemetry.capped,
  };
  if (
    !uniqueBy(programs.items, item => item.id)
    || !uniqueBy(topReferrers.items, referrerKey)
    || !uniqueBy(pendingRewards.items, item => item.id)
    || !uniqueBy(flaggedRewards.items, item => item.id)
    || !uniqueBy(auditTrail.items, item => item.id)
    || typedFunnel.attributedSignups !== typedFunnel.attributions
    || typedFunnel.eligibleFirstBookings !== typedFunnel.rewards
    || typedFunnel.pendingRewards !== typedFunnel.pending
    || typedFunnel.approvedRewards !== typedFunnel.approved
    || typedFunnel.rewards !== typedFunnel.pending + typedFunnel.approved
      + typedFunnel.rejected + typedFunnel.cancelled
    || typedTelemetry.validatedVisits !== typedFunnel.validatedVisits
    || typedTelemetry.capped !== (typedTelemetry.validatedVisits >= 1_000_000)
    || (typedTelemetry.state === 'unavailable' && typedTelemetry.validatedVisits !== 0)
  ) return null;

  const parsed: ReferralMarketingOverview = {
    contractVersion: 3,
    state: candidate.state,
    summaryEpoch: 'referral-v3',
    telemetry: typedTelemetry,
    programs,
    funnel: typedFunnel,
    approvedCreditTotals,
    topReferrers,
    pendingRewards,
    flaggedRewards: flaggedRewards as ReferralMarketingOverview['flaggedRewards'],
    auditTrail,
  };
  if (parsed.state === 'migrationRequired') {
    const noCounts = funnelKeys.every(key => parsed.funnel[key] === 0);
    const emptyPages = [parsed.programs, parsed.topReferrers, parsed.pendingRewards, parsed.flaggedRewards, parsed.auditTrail]
      .every(page => page.items.length === 0 && !page.truncated && page.nextPageToken === undefined);
    if (!noCounts || !emptyPages || parsed.approvedCreditTotals.length !== 0
      || parsed.telemetry.state !== 'unavailable' || parsed.telemetry.capped) return null;
  }
  return parsed;
}

export function referrerKey(
  referrer: Pick<TopReferrer, 'inviterId' | 'inviterOwnerType'>,
): string {
  return `${referrer.inviterOwnerType}:${referrer.inviterId}`;
}

export function funnelRate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export function telemetryText(telemetry: Telemetry | number): string {
  if (typeof telemetry === 'number') return `${telemetry} visite(s) validée(s)`;
  if (telemetry.state === 'unavailable') return 'Télémétrie indisponible';
  return `${telemetry.validatedVisits} visite(s) validée(s)${telemetry.capped ? ' · plafond atteint' : ''}`;
}

export function formatMoney(credit: Credit): string {
  try {
    if (!CURRENCY_PATTERN.test(credit.currency) || nonNegativeInteger(credit.amountMinor) === null) {
      return 'Montant indisponible';
    }
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: credit.currency,
      minimumFractionDigits: 2,
    }).format(credit.amountMinor / 100);
  } catch {
    return 'Montant indisponible';
  }
}

export function formatDate(value: unknown): string {
  if (!isIsoDate(value)) return 'Date indisponible';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Date indisponible';
  }
}

export function validateActionReason(action: ReviewAction, rawReason: string): string | null {
  if (action === 'approve') return null;
  if (rawReason.length > MAX_REASON_LENGTH) {
    return 'Le motif ne peut pas dépasser 500 caractères. Raccourcissez-le avant de réessayer.';
  }
  if (!rawReason.trim()) {
    return action === 'reject'
      ? 'Un motif est requis pour refuser ce crédit.'
      : action === 'flag'
        ? 'Un motif est requis pour signaler ce crédit.'
        : 'Un motif est requis pour retirer ce signalement.';
  }
  return null;
}

export function createLatestRequestCoordinator(): {
  begin: () => () => boolean;
  cancel: () => void;
  isActive: () => boolean;
} {
  let version = 0;
  let active = true;
  return {
    begin() {
      if (!active) return () => false;
      const requestVersion = ++version;
      return () => active && requestVersion === version;
    },
    cancel() {
      active = false;
      version += 1;
    },
    isActive() {
      return active;
    },
  };
}

export function createReferralDashboardRequestCoordinator(): {
  begin: (kind: RequestKind, supersedeAll?: boolean) => () => boolean;
  cancel: () => void;
  isActive: () => boolean;
} {
  let active = true;
  let generation = 0;
  const versions = new Map<RequestKind, number>();
  return {
    begin(kind, supersedeAll = false) {
      if (!active) return () => false;
      if (supersedeAll) {
        generation += 1;
        versions.clear();
      }
      const requestGeneration = generation;
      const requestVersion = (versions.get(kind) ?? 0) + 1;
      versions.set(kind, requestVersion);
      return () => active
        && generation === requestGeneration
        && versions.get(kind) === requestVersion;
    },
    cancel() {
      active = false;
      generation += 1;
      versions.clear();
    },
    isActive() {
      return active;
    },
  };
}

export function createSupersedableOperationLock(): {
  begin: () => number | null;
  supersede: () => void;
  release: (operation: number) => boolean;
  isLocked: () => boolean;
} {
  let generation = 0;
  let owner: number | null = null;
  return {
    begin() {
      if (owner !== null) return null;
      owner = ++generation;
      return owner;
    },
    supersede() {
      generation += 1;
      owner = null;
    },
    release(operation) {
      if (owner !== operation) return false;
      owner = null;
      return true;
    },
    isLocked() {
      return owner !== null;
    },
  };
}

export function parseReferralMarketingInitializerResult(
  value: unknown,
): { initialized: true; alreadyInitialized: boolean } | null {
  const candidate = object(value);
  if (!candidate || Object.keys(candidate).length !== 2 || candidate.initialized !== true
    || typeof candidate.alreadyInitialized !== 'boolean') return null;
  return { initialized: true, alreadyInitialized: candidate.alreadyInitialized };
}

export function canInitializeReferralOverview(
  overview: ReferralMarketingOverview | null,
): boolean {
  return overview?.state === 'migrationRequired';
}

export function overviewPageRequest(
  kind: PageKind,
  pageToken: string,
  auditFilter: Record<string, unknown>,
): Record<string, unknown> {
  if (!DOCUMENT_ID_PATTERN.test(pageToken)) throw new Error('Referral overview cursor is invalid');
  const request: Record<string, unknown> = { ...OVERVIEW_REQUEST, ...auditFilter };
  if (kind === 'programs') request.programPageToken = pageToken;
  else if (kind === 'pendingRewards') request.pendingPageToken = pageToken;
  else if (kind === 'flaggedRewards') request.flaggedPageToken = pageToken;
  else if (kind === 'auditTrail') request.auditPageToken = pageToken;
  else throw new Error('Referral overview collection is not pageable');
  return request;
}

function appendPage<T>(
  current: OverviewPage<T>,
  incoming: OverviewPage<T>,
  key: (item: T) => string,
): OverviewPage<T> | null {
  const currentKeys = new Set(current.items.map(key));
  if (incoming.items.some(item => currentKeys.has(key(item)))) return null;
  return {
    items: [...current.items, ...incoming.items],
    ...(incoming.nextPageToken ? { nextPageToken: incoming.nextPageToken } : {}),
    truncated: incoming.truncated,
  };
}

export function mergeOverviewPage(
  current: ReferralMarketingOverview,
  incoming: ReferralMarketingOverview,
  kind: PageKind,
): ReferralMarketingOverview | null {
  if (incoming.state === 'migrationRequired') return incoming;
  if (current.state !== 'ready') return incoming;
  if (kind === 'programs') {
    const programs = appendPage(current.programs, incoming.programs, item => item.id);
    return programs ? { ...current, programs } : null;
  }
  if (kind === 'pendingRewards') {
    const pendingRewards = appendPage(current.pendingRewards, incoming.pendingRewards, item => item.id);
    return pendingRewards ? { ...current, pendingRewards } : null;
  }
  if (kind === 'flaggedRewards') {
    const flaggedRewards = appendPage(current.flaggedRewards, incoming.flaggedRewards, item => item.id);
    return flaggedRewards ? { ...current, flaggedRewards } : null;
  }
  const auditTrail = appendPage(current.auditTrail, incoming.auditTrail, item => item.id);
  return auditTrail ? { ...current, auditTrail } : null;
}

export function reconcileSelectedProgramId(selectedProgramId: string, programs: Program[]): string {
  return programs.some(program => program.id === selectedProgramId) ? selectedProgramId : '';
}

export function programMutationIdentityFields(
  selectedProgramId: string,
  programs: Program[],
): { programId?: string } {
  const reconciledId = reconcileSelectedProgramId(selectedProgramId, programs);
  return reconciledId ? { programId: reconciledId } : {};
}

export function createRewardActionTracker(): {
  begin: (rewardId: string) => boolean;
  end: (rewardId: string) => void;
  has: (rewardId: string) => boolean;
  snapshot: () => string[];
} {
  const activeRewardIds = new Set<string>();
  return {
    begin(rewardId) {
      if (activeRewardIds.has(rewardId)) return false;
      activeRewardIds.add(rewardId);
      return true;
    },
    end(rewardId) {
      activeRewardIds.delete(rewardId);
    },
    has(rewardId) {
      return activeRewardIds.has(rewardId);
    },
    snapshot() {
      return [...activeRewardIds];
    },
  };
}

function isoDateInput(value: string): string {
  return value.slice(0, 10);
}

function todayWithOffset(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function creditList(credits: Credit[], empty = 'Aucun crédit émis'): string {
  return credits.length > 0 ? credits.map(formatMoney).join(' · ') : empty;
}

const ownerLabels: Record<Owner, string> = {
  client: 'Client',
  freelancer: 'Freelance',
  brand: 'Marque',
};

const statusLabels: Record<ProgramStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  paused: 'En pause',
  archived: 'Archivé',
};

const auditFilterLabels: Record<AuditFilterKind, string> = {
  code: 'Code',
  programId: 'Programme',
  rewardId: 'Récompense',
  action: 'Action',
};

export default function ReferralMarketingDashboard() {
  const [overview, setOverview] = useState<ReferralMarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<AuditFilterKind>('code');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programStatus, setProgramStatus] = useState<ProgramStatus>('active');
  const [countryCodes, setCountryCodes] = useState('FR');
  const [currency, setCurrency] = useState('EUR');
  const [inviterCredit, setInviterCredit] = useState('5');
  const [invitedDiscount, setInvitedDiscount] = useState('3');
  const [startsAt, setStartsAt] = useState(todayWithOffset(0));
  const [endsAt, setEndsAt] = useState(todayWithOffset(365));
  const [savingProgram, setSavingProgram] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initializationStatus, setInitializationStatus] = useState<string | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState<Partial<Record<PageKind, boolean>>>({});
  const [pageErrors, setPageErrors] = useState<Partial<Record<PageKind, string>>>({});
  const [actingRewardIds, setActingRewardIds] = useState<Set<string>>(() => new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const requestCoordinator = useRef(createReferralDashboardRequestCoordinator());
  const initializerLock = useRef(createSupersedableOperationLock());
  const rewardActionTracker = useRef(createRewardActionTracker());
  const activeFilter = useRef<Record<string, unknown>>({});

  const selectedProgram = useMemo(
    () => overview?.programs.items.find(program => program.id === selectedProgramId) ?? null,
    [overview, selectedProgramId],
  );

  const replaceOverview = (nextOverview: ReferralMarketingOverview) => {
    setOverview(nextOverview);
    setSelectedProgramId(current => reconcileSelectedProgramId(
      current,
      nextOverview.state === 'ready' ? nextOverview.programs.items : [],
    ));
  };

  const loadOverview = async (filter: Record<string, unknown> = activeFilter.current) => {
    if (!requestCoordinator.current.isActive()) return;
    const isCurrent = requestCoordinator.current.begin('overview', true);
    if (!isCurrent()) return;
    initializerLock.current.supersede();
    setInitializing(false);
    setLoading(true);
    setLoadError(null);
    setInitializationStatus(null);
    setInitializationError(null);
    setPageErrors({});
    setPageLoading({});
    try {
      const result = await overviewCall({ ...OVERVIEW_REQUEST, ...filter });
      const nextOverview = parseReferralMarketingOverview(result.data);
      if (!nextOverview) throw new Error('Invalid referral marketing overview V3');
      if (!isCurrent()) return;
      replaceOverview(nextOverview);
    } catch (reason) {
      if (!isCurrent()) return;
      console.error('Unable to load referral marketing overview', reason);
      setLoadError('Données indisponibles ou contrat V3 incompatible. Actualisez ou vérifiez vos droits Super Admin.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    const coordinator = createReferralDashboardRequestCoordinator();
    requestCoordinator.current = coordinator;
    void loadOverview();
    return () => {
      initializerLock.current.supersede();
      coordinator.cancel();
    };
  }, []);

  const initializeOverview = async () => {
    if (!canInitializeReferralOverview(overview) || initializing) return;
    const confirmed = window.confirm(
      'Initialiser la projection V3 uniquement si cet environnement ne contient encore aucune donnée de parrainage ? '
      + 'Si un historique existe, le serveur refusera et une migration réconciliée restera obligatoire.',
    );
    if (!confirmed) return;
    const operation = initializerLock.current.begin();
    if (operation === null) return;
    const isCurrent = requestCoordinator.current.begin('initializer', true);
    if (!isCurrent()) {
      initializerLock.current.release(operation);
      return;
    }
    setInitializing(true);
    setInitializationError(null);
    setInitializationStatus('Vérification serveur de l’environnement en cours…');
    try {
      const result = await initializeCall({});
      const parsed = parseReferralMarketingInitializerResult(result.data);
      if (!parsed) throw new Error('Invalid referral marketing initializer response');
      if (!isCurrent()) return;
      setInitializationStatus(parsed.alreadyInitialized
        ? 'La projection V3 était déjà initialisée. Rechargement des données vérifiées…'
        : 'Projection V3 vide initialisée par le serveur. Rechargement des données vérifiées…');
      toast.success(parsed.alreadyInitialized
        ? 'Projection V3 déjà initialisée.'
        : 'Projection V3 initialisée pour cet environnement vide.');
      await loadOverview();
    } catch (reason) {
      if (!isCurrent()) return;
      console.error('Unable to initialize referral marketing projection', reason);
      setInitializationStatus(null);
      setInitializationError(
        'Initialisation refusée ou indisponible. Si des données existent, utilisez uniquement la migration Admin SDK réconciliée et validée.',
      );
    } finally {
      initializerLock.current.release(operation);
      if (requestCoordinator.current.isActive()) {
        setInitializing(initializerLock.current.isLocked());
      }
    }
  };

  const loadMorePage = async (kind: PageKind) => {
    if (!overview || overview.state !== 'ready') return;
    const currentPage = overview[kind];
    const pageToken = currentPage.nextPageToken;
    if (!currentPage.truncated || !pageToken || pageLoading[kind]) return;
    const isCurrent = requestCoordinator.current.begin(kind);
    if (!isCurrent()) return;
    setPageLoading(current => ({ ...current, [kind]: true }));
    setPageErrors(current => ({ ...current, [kind]: undefined }));
    try {
      const result = await overviewCall(overviewPageRequest(kind, pageToken, activeFilter.current));
      const incoming = parseReferralMarketingOverview(result.data);
      if (!incoming) throw new Error('Invalid referral marketing overview cursor page');
      if (!isCurrent()) return;
      if (incoming.state === 'migrationRequired') {
        replaceOverview(incoming);
        setPageLoading({});
        setPageErrors({});
        requestCoordinator.current.begin('overview', true);
        return;
      }
      const preview = mergeOverviewPage(overview, incoming, kind);
      if (!preview) throw new Error('Referral overview cursor page overlaps loaded rows');
      setOverview(current => current ? mergeOverviewPage(current, incoming, kind) ?? current : incoming);
    } catch (reason) {
      if (!isCurrent()) return;
      console.error(`Unable to load more referral ${kind}`, reason);
      setPageErrors(current => ({
        ...current,
        [kind]: 'Impossible de charger la suite. Les résultats déjà affichés restent partiels.',
      }));
    } finally {
      if (isCurrent()) setPageLoading(current => ({ ...current, [kind]: false }));
    }
  };

  const selectProgram = (programId: string) => {
    setSelectedProgramId(programId);
    const program = overview?.programs.items.find(item => item.id === programId);
    if (!program) {
      setProgramStatus('active');
      setCountryCodes('FR');
      setCurrency('EUR');
      setInviterCredit('5');
      setInvitedDiscount('3');
      setStartsAt(todayWithOffset(0));
      setEndsAt(todayWithOffset(365));
      return;
    }
    setProgramStatus(program.status);
    setCountryCodes(program.countryCodes.join(', '));
    setCurrency(program.currency);
    setInviterCredit((program.inviterCreditMinor / 100).toFixed(2));
    setInvitedDiscount((program.invitedDiscountMinor / 100).toFixed(2));
    setStartsAt(isoDateInput(program.startsAt));
    setEndsAt(isoDateInput(program.endsAt));
  };

  const saveProgram = async (event: FormEvent) => {
    event.preventDefault();
    const lifecycle = requestCoordinator.current;
    if (!lifecycle.isActive()) return;
    const normalizedCountries = countryCodes.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
    const normalizedCurrency = currency.trim().toUpperCase();
    const inviterCreditMinor = Math.round(Number(inviterCredit) * 100);
    const invitedDiscountMinor = Math.round(Number(invitedDiscount) * 100);
    if (
      normalizedCountries.length === 0
      || normalizedCountries.length > 25
      || normalizedCountries.some(value => !COUNTRY_PATTERN.test(value))
      || new Set(normalizedCountries).size !== normalizedCountries.length
      || !CURRENCY_PATTERN.test(normalizedCurrency)
      || !Number.isSafeInteger(inviterCreditMinor)
      || inviterCreditMinor < 0
      || inviterCreditMinor > 1_000_000
      || !Number.isSafeInteger(invitedDiscountMinor)
      || invitedDiscountMinor < 0
      || invitedDiscountMinor > 1_000_000
      || !startsAt
      || !endsAt
      || Date.parse(startsAt) > Date.parse(endsAt)
    ) {
      toast.error('Vérifiez les pays, la devise, les crédits et la période du programme.');
      return;
    }
    setSavingProgram(true);
    try {
      await createProgramCall({
        ...programMutationIdentityFields(selectedProgramId, overview?.programs.items ?? []),
        status: programStatus,
        countryCodes: normalizedCountries,
        currency: normalizedCurrency,
        inviterCreditMinor,
        invitedDiscountMinor,
        startsAt: `${startsAt}T00:00:00.000Z`,
        endsAt: `${endsAt}T23:59:59.999Z`,
      });
      if (!lifecycle.isActive()) return;
      toast.success(selectedProgram
        ? 'Programme de parrainage mis à jour.'
        : 'Programme de parrainage créé.');
      await loadOverview();
    } catch (reason) {
      if (!lifecycle.isActive()) return;
      console.error('Unable to save referral program', reason);
      toast.error('Impossible d’enregistrer ce programme. Vérifiez son statut et sa période.');
    } finally {
      if (lifecycle.isActive()) setSavingProgram(false);
    }
  };

  const performRewardAction = async (rewardId: string, action: ReviewAction) => {
    const lifecycle = requestCoordinator.current;
    if (!lifecycle.isActive()) return;
    const rawReason = reasons[rewardId] ?? '';
    const validationError = validateActionReason(action, rawReason);
    if (validationError) {
      setActionErrors(current => ({ ...current, [rewardId]: validationError }));
      return;
    }
    if (!rewardActionTracker.current.begin(rewardId)) return;
    setActionErrors(current => {
      const next = { ...current };
      delete next[rewardId];
      return next;
    });
    setActingRewardIds(new Set(rewardActionTracker.current.snapshot()));
    try {
      const reason = rawReason.trim();
      if (action === 'approve' || action === 'reject') {
        await reviewCall({
          rewardId,
          decision: action,
          ...(action === 'reject' ? { reason } : {}),
        });
      } else {
        await flagCall({ rewardId, flagged: action === 'flag', reason });
      }
      if (!lifecycle.isActive()) return;
      toast.success(action === 'approve'
        ? 'Crédit plateforme accordé après revue.'
        : action === 'reject'
          ? 'Crédit refusé avec motif.'
          : action === 'flag'
            ? 'Crédit signalé pour contrôle.'
            : 'Signalement retiré après contrôle.');
      setReasons(current => ({ ...current, [rewardId]: '' }));
      await loadOverview();
    } catch (reason) {
      if (!lifecycle.isActive()) return;
      console.error('Unable to perform referral reward action', reason);
      setActionErrors(current => ({
        ...current,
        [rewardId]: 'Cette action a échoué. Vérifiez que le crédit est toujours en attente, puis réessayez.',
      }));
    } finally {
      rewardActionTracker.current.end(rewardId);
      if (lifecycle.isActive()) {
        setActingRewardIds(new Set(rewardActionTracker.current.snapshot()));
      }
    }
  };

  const submitAuditSearch = (event: FormEvent) => {
    event.preventDefault();
    const normalizedQuery = query.trim();
    const filter = normalizedQuery
      ? { [filterKind]: filterKind === 'code' || filterKind === 'action' ? normalizedQuery.toUpperCase() : normalizedQuery }
      : {};
    activeFilter.current = filter;
    void loadOverview(filter);
  };

  const funnelMetrics: Array<{ label: string; value: number | string; detail: string }> = overview ? [
    { label: 'Codes', value: overview.funnel.codes, detail: 'Codes réservés' },
    {
      label: 'Visites validées',
      value: overview.telemetry.state === 'verified' ? overview.telemetry.validatedVisits : '—',
      detail: telemetryText(overview.telemetry),
    },
    { label: 'Attributions', value: overview.funnel.attributions, detail: `${funnelRate(overview.funnel.attributions, overview.funnel.codes)} % des codes` },
    { label: 'Inscriptions attribuées', value: overview.funnel.attributedSignups, detail: 'Projection V3 vérifiée' },
    { label: 'Récompenses', value: overview.funnel.rewards, detail: 'Dossiers créés' },
    { label: '1ers RDV éligibles', value: overview.funnel.eligibleFirstBookings, detail: 'Projection V3 vérifiée' },
    { label: 'En attente', value: overview.funnel.pending, detail: 'Statut récompense' },
    { label: 'Crédits en attente', value: overview.funnel.pendingRewards, detail: 'Alias V3 vérifié' },
    { label: 'Approuvés', value: overview.funnel.approved, detail: 'Statut récompense' },
    { label: 'Crédits approuvés', value: overview.funnel.approvedRewards, detail: 'Alias V3 vérifié' },
    { label: 'Refusés', value: overview.funnel.rejected, detail: 'Statut récompense' },
    { label: 'Annulés', value: overview.funnel.cancelled, detail: 'Statut récompense' },
  ] : [];

  const standardPendingRewards = overview?.pendingRewards.items.filter(
    reward => reward.fraudFlag?.status !== 'flagged',
  ) ?? [];

  const renderReward = (
    reward: Reward,
    activelyFlagged: boolean,
  ) => (
    <article
      key={reward.id}
      className={`rounded-2xl border p-4 ${activelyFlagged
        ? 'border-amber-300/30 bg-amber-300/[0.07]'
        : 'border-white/10 bg-black/25'}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black text-white">{activelyFlagged ? 'Signalé' : 'À examiner'} · {reward.id}</p>
          <p className="mt-1 text-sm text-white/60">
            Invitant : {reward.inviterId} · Invité : {reward.invitedUserId}
          </p>
          <p className="mt-1 text-xs text-white/45">
            Programme {reward.programId} · Réservation {reward.bookingId}
          </p>
          <p className="mt-1 text-xs text-white/45">
            Créé le {reward.createdAt ? formatDate(reward.createdAt) : 'date non fournie'}
          </p>
          {reward.fraudFlag && (
            <p className={`mt-2 text-xs ${activelyFlagged ? 'text-amber-200' : 'text-white/50'}`}>
              Fraude : {reward.fraudFlag.status === 'flagged' ? 'signalée' : 'signalement levé'}
              {reward.fraudFlag.reason ? ` · ${reward.fraudFlag.reason}` : ' · motif vide publié par le service'}
            </p>
          )}
        </div>
        <div className="text-left md:text-right">
          <p className="font-bold text-[#f5dfa0]">
            {formatMoney({ amountMinor: reward.inviterCreditMinor, currency: reward.currency })}
            {' + '}
            {formatMoney({ amountMinor: reward.invitedDiscountMinor, currency: reward.currency })}
          </p>
          <p className="text-xs text-white/45">invitant + invité · crédits proposés</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 lg:flex-row">
        <div className="min-w-0 flex-1">
          <input
            value={reasons[reward.id] ?? ''}
            onChange={event => setReasons(current => ({ ...current, [reward.id]: event.target.value }))}
            placeholder="Motif (requis pour refuser ou modifier un signalement)"
            aria-label={`Motif pour ${reward.id}`}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
          />
          <p className="mt-1 text-right text-[11px] text-white/35">
            {(reasons[reward.id] ?? '').length}/500
          </p>
          {actionErrors[reward.id] && (
            <p role="alert" className="mt-1 text-xs font-semibold text-rose-200">{actionErrors[reward.id]}</p>
          )}
        </div>
        <button
          type="button"
          disabled={actingRewardIds.has(reward.id)}
          onClick={() => void performRewardAction(reward.id, activelyFlagged ? 'clear' : 'flag')}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-300/30 px-3 text-sm font-bold text-amber-100 disabled:opacity-50"
        >
          <Flag className="h-4 w-4" />
          {activelyFlagged ? 'Retirer le signalement' : 'Signaler'}
        </button>
        <button
          type="button"
          disabled={actingRewardIds.has(reward.id)}
          onClick={() => void performRewardAction(reward.id, 'reject')}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/30 px-3 text-sm font-bold text-rose-200 disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" /> Refuser
        </button>
        <button
          type="button"
          disabled={actingRewardIds.has(reward.id) || activelyFlagged}
          onClick={() => void performRewardAction(reward.id, 'approve')}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 text-sm font-black text-black disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" /> Approuver
        </button>
      </div>
    </article>
  );

  const renderPageFooter = (kind: PageKind, page: OverviewPage<unknown>) => (
    <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs text-white/45">
          {page.items.length} résultat(s) chargé(s).
          {page.truncated
            ? ' Cette liste est partielle.'
            : ' Cette réponse ne signale aucune page suivante ; actualisez pour vérifier les mutations récentes.'}
        </p>
        {pageErrors[kind] && <p role="alert" className="mt-1 text-xs font-semibold text-rose-200">{pageErrors[kind]}</p>}
      </div>
      {page.truncated && (
        <button
          type="button"
          disabled={pageLoading[kind]}
          onClick={() => void loadMorePage(kind)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 disabled:opacity-50"
        >
          <RefreshCw className={pageLoading[kind] ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {pageLoading[kind] ? 'Chargement…' : 'Charger la suite'}
        </button>
      )}
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#201b0a] to-[#111] p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-black">Marketing &amp; parrainage</h2>
            <p className="mt-1 text-sm text-white/60">Projection V3, pages bornées et revue manuelle traçable.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            aria-busy={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/5"
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Actualiser
          </button>
        </div>
        <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Chaque attribution reste soumise à une revue manuelle. Une approbation crée des crédits plateforme
          séparés par devise — aucun paiement ni transfert de fonds.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          <p className="font-bold">{loadError}</p>
          <button type="button" onClick={() => void loadOverview()} className="mt-3 rounded-lg border border-rose-200/30 px-3 py-1.5 font-bold">
            Réessayer
          </button>
        </div>
      )}

      {loading && !overview ? (
        <div aria-label="Chargement du tableau de bord" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
        </div>
      ) : !overview ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/55">
          Aucune donnée de parrainage validée n’est disponible.
        </div>
      ) : overview.state === 'migrationRequired' ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-6" role="status">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
            <div>
              <h3 className="text-lg font-black text-amber-100">Projection V3 à initialiser ou à migrer</h3>
              <p className="mt-2 text-sm leading-6 text-amber-50/80">
                Le serveur n’a publié aucune projection V3 vérifiée. Les zéros techniques de cette réponse ne sont pas
                affichés comme des métriques réelles, et les actions métier restent masquées.
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-50/70">
                L’initialiseur ci-dessous est autorisé uniquement pour un environnement vide. S’il détecte le moindre
                historique, il refuse sans conversion : une migration Admin SDK réconciliée et revue est alors requise.
              </p>
              {initializationStatus && <p className="mt-3 text-sm font-bold text-sky-100">{initializationStatus}</p>}
              {initializationError && <p role="alert" className="mt-3 text-sm font-bold text-rose-200">{initializationError}</p>}
              <button
                type="button"
                disabled={initializing}
                onClick={() => void initializeOverview()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"
              >
                <ShieldAlert className="h-4 w-4" />
                {initializing ? 'Vérification et initialisation…' : 'Initialiser un environnement vide'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-100/70">Télémétrie agrégée</p>
            <p className="mt-1 text-sm text-sky-50">
              {telemetryText(overview.telemetry)}. Une télémétrie indisponible reste explicitement inconnue ;
              elle n’est jamais transformée en zéro observé.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {funnelMetrics.map(metric => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">{metric.label}</p>
                <p className="mt-2 text-3xl font-black text-[#D4AF37]">{metric.value}</p>
                <p className="mt-1 text-xs text-white/50">{metric.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
            <form onSubmit={saveProgram} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div>
                <h3 className="text-lg font-black">Créer ou modifier un programme</h3>
                <p className="mt-1 text-sm text-white/55">Montants, pays, devise, période et statut réellement publiés.</p>
              </div>
              <label className="block text-sm font-bold text-white/70">
                Programme
                <select value={selectedProgramId} onChange={event => selectProgram(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white">
                  <option value="">Nouveau programme</option>
                  {overview.programs.items.map(program => (
                    <option key={program.id} value={program.id}>{program.id} · {statusLabels[program.status]}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-white/70">
                  Pays (codes séparés par une virgule)
                  <input required value={countryCodes} onChange={event => setCountryCodes(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
                <label className="block text-sm font-bold text-white/70">
                  Devise
                  <input required maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-white/70">
                  Crédit invitant
                  <input required min="0" step="0.01" type="number" value={inviterCredit} onChange={event => setInviterCredit(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
                <label className="block text-sm font-bold text-white/70">
                  Réduction invité
                  <input required min="0" step="0.01" type="number" value={invitedDiscount} onChange={event => setInvitedDiscount(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-white/70">
                  Début
                  <input required type="date" value={startsAt} onChange={event => setStartsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
                <label className="block text-sm font-bold text-white/70">
                  Fin
                  <input required type="date" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white" />
                </label>
              </div>
              <label className="block text-sm font-bold text-white/70">
                Statut
                <select value={programStatus} onChange={event => setProgramStatus(event.target.value as ProgramStatus)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white">
                  <option value="draft">Brouillon</option>
                  <option value="active">Actif</option>
                  <option value="paused">En pause</option>
                  <option value="archived">Archivé</option>
                </select>
              </label>
              <button disabled={savingProgram} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
                {programStatus === 'active' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {savingProgram ? 'Enregistrement…' : selectedProgram ? 'Mettre à jour' : 'Créer le programme'}
              </button>
            </form>

            <div className="space-y-6">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-black">Programmes chargés</h3>
                <div className="mt-4 space-y-3">
                  {overview.programs.items.map(program => (
                    <article key={program.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-white">{program.id}</p>
                        <span className="rounded-full border border-[#D4AF37]/25 px-2 py-1 text-xs font-bold text-[#f5dfa0]">{statusLabels[program.status]}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/60">Pays : {program.countryCodes.join(', ')} · Devise : {program.currency}</p>
                      <p className="mt-1 text-sm text-white/60">
                        Invitant {formatMoney({ currency: program.currency, amountMinor: program.inviterCreditMinor })}
                        {' · '}Invité {formatMoney({ currency: program.currency, amountMinor: program.invitedDiscountMinor })}
                      </p>
                      <p className="mt-1 text-xs text-white/40">{formatDate(program.startsAt)} → {formatDate(program.endsAt)}</p>
                    </article>
                  ))}
                  {overview.programs.items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">Aucun programme dans cette page.</p>}
                </div>
                {renderPageFooter('programs', overview.programs)}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-black">Crédits approuvés émis</h3>
                <p className="mt-2 text-sm font-bold text-[#f5dfa0]">{creditList(overview.approvedCreditTotals)}</p>
                <p className="mt-1 text-xs text-white/45">Chaque devise reste séparée ; aucun total converti n’est inventé.</p>
              </section>
            </div>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h3 className="text-lg font-black">Meilleurs prescripteurs</h3>
            <p className="mt-1 text-sm text-white/55">
              Identité typée, attributions, récompenses et crédits approuvés par devise. Classement fixe : top 10.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {overview.topReferrers.items.map((referrer, index) => (
                <article key={referrerKey(referrer)} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="font-black text-white">#{index + 1} · {ownerLabels[referrer.inviterOwnerType]} · {referrer.inviterId}</p>
                  <p className="mt-1 text-sm text-white/55">{referrer.referrals} attribution(s) · {referrer.rewards} récompense(s)</p>
                  <p className="mt-2 text-sm font-bold text-[#f5dfa0]">{creditList(referrer.approvedCreditTotals)}</p>
                </article>
              ))}
              {overview.topReferrers.items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">Aucun prescripteur à classer.</p>}
            </div>
            {overview.topReferrers.truncated && (
              <p className="mt-4 text-xs font-semibold text-amber-200">
                Le serveur signale d’autres prescripteurs ; ce classement reste volontairement limité au top 10.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.03] p-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-300" />
              <div>
                <h3 className="text-lg font-black">Signalements actifs chargés · {overview.flaggedRewards.items.length}</h3>
                <p className="text-sm text-white/55">L’approbation reste bloquée jusqu’au retrait motivé du signalement.</p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {overview.flaggedRewards.items.map(reward => renderReward(reward, true))}
              {overview.flaggedRewards.items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">Aucun crédit signalé dans cette page.</p>}
            </div>
            {renderPageFooter('flaggedRewards', overview.flaggedRewards)}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-[#D4AF37]" />
              <div>
                <h3 className="text-lg font-black">File de revue chargée · {overview.pendingRewards.items.length}</h3>
                <p className="text-sm text-white/55">Les éléments signalés apparaissent dans la section prioritaire ci-dessus.</p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {standardPendingRewards.map(reward => renderReward(reward, false))}
              {standardPendingRewards.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">Aucun autre crédit dans cette page.</p>}
            </div>
            {renderPageFooter('pendingRewards', overview.pendingRewards)}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-lg font-black">Journal d’audit borné</h3>
                <p className="mt-1 text-sm text-white/55">20 entrées par page (maximum contractuel configurable : 50).</p>
              </div>
              <form onSubmit={submitAuditSearch} className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <select value={filterKind} onChange={event => setFilterKind(event.target.value as AuditFilterKind)} className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white">
                  {Object.entries(auditFilterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Recherche audit" className="min-w-0 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35" />
                <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white">
                  <Search className="h-4 w-4" /> Rechercher
                </button>
              </form>
            </div>
            <div className="mt-5 space-y-3">
              {overview.auditTrail.items.map(entry => (
                <article key={entry.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <p className="font-black text-white">{entry.action}</p>
                    <p className="text-xs text-white/45">{entry.createdAt ? formatDate(entry.createdAt) : 'Horodatage non fourni'}</p>
                  </div>
                  <p className="mt-2 text-sm text-white/60">
                    Entrée {entry.id}
                    {entry.code ? ` · Code ${entry.code}` : ''}
                    {entry.programId ? ` · Programme ${entry.programId}` : ''}
                    {entry.rewardId ? ` · Récompense ${entry.rewardId}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    Acteur : {entry.actorUid ?? 'non fourni'}
                    {' · '}Motif : {entry.reason ?? 'non fourni'}
                  </p>
                </article>
              ))}
              {overview.auditTrail.items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">Aucune entrée dans cette page.</p>}
            </div>
            {renderPageFooter('auditTrail', overview.auditTrail)}
          </section>

          {loading && overview && (
            <p role="status" className="flex items-center gap-2 text-xs text-white/45">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Mise à jour en cours…
            </p>
          )}
        </>
      )}
    </section>
  );
}
