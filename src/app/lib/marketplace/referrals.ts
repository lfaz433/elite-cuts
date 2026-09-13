import { httpsCallable } from 'firebase/functions';
import { functions, referralAppCheckEnabled } from '../firebase';

export interface ReferralCode {
  code: string;
  ownerType: ReferralSurface;
  programId: string;
  status: string;
}

export type ReferralRewardStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ReferralWorkspaceHistoryItem {
  id: string;
  ownerType: ReferralSurface;
  role: 'inviter' | 'invitee';
  amountMinor: number;
  currency: string;
  status: ReferralRewardStatus;
  createdAt?: string;
}

export interface ReferralWorkspaceCreditTotal {
  currency: string;
  approvedMinor: number;
  pendingMinor: number;
}

export interface ReferralWorkspaceRoleSummary {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  flaggedPendingCount: number;
  creditTotals: ReferralWorkspaceCreditTotal[];
}

export interface ReferralWorkspaceSummary {
  ownerType: ReferralSurface;
  state: 'verified' | 'unavailable';
  codeCount: number;
  attributionCount: number;
  currentCode?: { code: string; programId: string; status: string };
  inviter: ReferralWorkspaceRoleSummary;
  invitee: ReferralWorkspaceRoleSummary;
}

export interface ReferralWorkspace {
  contractVersion: 3;
  state: 'ready' | 'migrationRequired';
  scope: ReferralCodeScope;
  summary: ReferralWorkspaceSummary;
  attribution?: {
    code: string;
    programId: string;
    inviterOwnerType: ReferralSurface;
    expiresAt: string;
  };
  history: {
    role: 'inviter' | 'invitee';
    items: ReferralWorkspaceHistoryItem[];
    nextPageToken?: string;
    truncated: boolean;
  };
}

export type ReferralReward = ReferralWorkspaceHistoryItem;
export type ReferralCreditTotal = ReferralWorkspaceCreditTotal;

export interface CreatedReferralCode {
  code: string;
  ownerType: 'client' | 'freelancer' | 'brand';
  programId: string;
  reused: boolean;
}

export interface PublicReferralCode {
  code: string;
  status: 'active';
}

export type ReferralSurface = 'client' | 'freelancer' | 'brand';

export type ReferralCodeScope =
  | { type: 'client' }
  | { type: 'freelancer' }
  | { type: 'brand'; brandId: string };

type ReferralWorkspacePageOptions = { limit?: number; pageToken?: string };
export type ReferralWorkspaceRequest = ReferralWorkspacePageOptions & (
  | { scope: { type: 'client' }; role?: 'inviter' | 'invitee' }
  | { scope: { type: 'freelancer' }; role?: 'inviter' }
  | { scope: { type: 'brand'; brandId: string }; role?: 'inviter' }
);

export interface StoredReferralAttribution {
  code: string;
  capturedAt: number;
  expiresAt: number;
}

export class ReferralStorageUnavailableError extends Error {
  constructor() {
    super('Referral storage is unavailable');
    this.name = 'ReferralStorageUnavailableError';
  }
}

const getMyReferralWorkspaceCall = httpsCallable<ReferralWorkspaceRequest, unknown>(
  functions,
  'getMyReferralWorkspace',
);
const createMyReferralCodeCall = httpsCallable<{ scope: ReferralCodeScope }, unknown>(functions, 'createMyReferralCode');
const getPublicReferralCodeCall = httpsCallable<{ code: string }, unknown>(functions, 'getPublicReferralCode');
const recordReferralVisitCall = httpsCallable<{ code: string }, unknown>(
  functions,
  'recordReferralVisit',
  { limitedUseAppCheckTokens: true },
);

export const REFERRAL_ATTRIBUTION_STORAGE_KEY = 'barberboard.referral-attribution';
export const REFERRAL_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const REFERRAL_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isSurface(value: unknown): value is ReferralSurface {
  return value === 'client' || value === 'freelancer' || value === 'brand';
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function sameReferralScope(left: ReferralCodeScope, right: ReferralCodeScope): boolean {
  return left.type === right.type && (left.type !== 'brand' || right.type === 'brand' && left.brandId === right.brandId);
}

function parseResponseScope(value: unknown, expected: ReferralCodeScope): ReferralCodeScope | null {
  const candidate = record(value);
  if (!candidate || candidate.type !== expected.type) return null;
  if (expected.type === 'brand') {
    return typeof candidate.brandId === 'string' && candidate.brandId === expected.brandId
      ? { type: 'brand', brandId: candidate.brandId }
      : null;
  }
  return candidate.brandId === undefined ? { type: expected.type } : null;
}

function parseCreditTotals(value: unknown): ReferralWorkspaceCreditTotal[] | null {
  if (!Array.isArray(value)) return null;
  const totals = value.map(value => {
    const total = record(value);
    if (
      !total
      || typeof total.currency !== 'string' || !/^[A-Z]{3}$/.test(total.currency)
      || !isNonNegativeSafeInteger(total.approvedMinor)
      || !isNonNegativeSafeInteger(total.pendingMinor)
    ) return null;
    if (!Number.isSafeInteger(total.approvedMinor + total.pendingMinor)) return null;
    return { currency: total.currency, approvedMinor: total.approvedMinor, pendingMinor: total.pendingMinor };
  });
  if (totals.some(total => total === null)) return null;
  const parsed = totals as ReferralWorkspaceCreditTotal[];
  return new Set(parsed.map(total => total.currency)).size === parsed.length ? parsed : null;
}

function parseRoleSummary(value: unknown): ReferralWorkspaceRoleSummary | null {
  const candidate = record(value);
  if (!candidate) return null;
  const creditTotals = parseCreditTotals(candidate.creditTotals);
  if (!creditTotals || !isNonNegativeSafeInteger(candidate.pendingCount)
    || !isNonNegativeSafeInteger(candidate.approvedCount)
    || !isNonNegativeSafeInteger(candidate.rejectedCount)
    || !isNonNegativeSafeInteger(candidate.cancelledCount)
    || !isNonNegativeSafeInteger(candidate.flaggedPendingCount)) return null;
  return {
    pendingCount: candidate.pendingCount,
    approvedCount: candidate.approvedCount,
    rejectedCount: candidate.rejectedCount,
    cancelledCount: candidate.cancelledCount,
    flaggedPendingCount: candidate.flaggedPendingCount,
    creditTotals,
  };
}

function parseSummary(value: unknown, ownerType: ReferralSurface): ReferralWorkspaceSummary | null {
  const candidate = record(value);
  if (!candidate || candidate.ownerType !== ownerType
    || (candidate.state !== 'verified' && candidate.state !== 'unavailable')
    || !isNonNegativeSafeInteger(candidate.codeCount)
    || !isNonNegativeSafeInteger(candidate.attributionCount)) return null;
  const inviter = parseRoleSummary(candidate.inviter);
  const invitee = parseRoleSummary(candidate.invitee);
  if (!inviter || !invitee) return null;
  const current = candidate.currentCode === undefined ? undefined : record(candidate.currentCode);
  const currentCode = current && typeof current.code === 'string' && current.code.length > 0
    && typeof current.programId === 'string' && current.programId.length > 0
    && typeof current.status === 'string' && current.status.length > 0
    ? { code: current.code, programId: current.programId, status: current.status }
    : undefined;
  if (candidate.currentCode !== undefined && !currentCode || candidate.state === 'unavailable' && currentCode) return null;
  if (candidate.state === 'unavailable' && (
    candidate.codeCount !== 0 || candidate.attributionCount !== 0
    || [inviter, invitee].some(role => role.pendingCount !== 0 || role.approvedCount !== 0
      || role.rejectedCount !== 0 || role.cancelledCount !== 0 || role.flaggedPendingCount !== 0
      || role.creditTotals.length !== 0)
  )) return null;
  return {
    ownerType,
    state: candidate.state,
    codeCount: candidate.codeCount,
    attributionCount: candidate.attributionCount,
    inviter,
    invitee,
    ...(currentCode ? { currentCode } : {}),
  };
}

function parseHistoryItem(
  value: unknown,
  ownerType: ReferralSurface,
  role: 'inviter' | 'invitee',
): ReferralWorkspaceHistoryItem | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.id !== 'string' || candidate.id.length === 0
    || candidate.ownerType !== ownerType || candidate.role !== role
    || !isNonNegativeSafeInteger(candidate.amountMinor)
    || typeof candidate.currency !== 'string' || !/^[A-Z]{3}$/.test(candidate.currency)
    || !['pending', 'approved', 'rejected', 'cancelled'].includes(String(candidate.status))
    || candidate.createdAt !== undefined && (typeof candidate.createdAt !== 'string'
      || Number.isNaN(Date.parse(candidate.createdAt)))) return null;
  return {
    id: candidate.id,
    ownerType,
    role,
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    status: candidate.status as ReferralRewardStatus,
    ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt }),
  };
}

function parseReferralWorkspace(value: unknown, request: ReferralWorkspaceRequest): ReferralWorkspace | null {
  const candidate = record(value);
  const scope = parseResponseScope(candidate?.scope, request.scope);
  if (!candidate || candidate.contractVersion !== 3
    || (candidate.state !== 'ready' && candidate.state !== 'migrationRequired')
    || !scope) return null;
  const summary = parseSummary(candidate.summary, scope.type);
  const expectedRole = request.role ?? 'inviter';
  const history = record(candidate.history);
  const pageLimit = request.limit ?? 10;
  if (!summary || !history || history.role !== expectedRole || !Array.isArray(history.items)
    || typeof history.truncated !== 'boolean'
    || history.nextPageToken !== undefined && (typeof history.nextPageToken !== 'string'
      || !REFERRAL_DOCUMENT_ID_PATTERN.test(history.nextPageToken))
    || history.truncated !== (typeof history.nextPageToken === 'string')) return null;
  const items = history.items.map(item => parseHistoryItem(item, scope.type, expectedRole));
  if (items.some(item => item === null) || items.length > pageLimit) return null;
  const attributionRecord = candidate.attribution === undefined ? undefined : record(candidate.attribution);
  const attribution = attributionRecord && typeof attributionRecord.code === 'string' && attributionRecord.code.length > 0
    && typeof attributionRecord.programId === 'string' && attributionRecord.programId.length > 0
    && isSurface(attributionRecord.inviterOwnerType)
    && typeof attributionRecord.expiresAt === 'string' && !Number.isNaN(Date.parse(attributionRecord.expiresAt))
    ? {
      code: attributionRecord.code,
      programId: attributionRecord.programId,
      inviterOwnerType: attributionRecord.inviterOwnerType,
      expiresAt: attributionRecord.expiresAt,
    } : undefined;
  if (candidate.attribution !== undefined && !attribution || scope.type !== 'client' && attribution) return null;
  if (candidate.state === 'migrationRequired' && (summary.state !== 'unavailable' || attribution
    || items.length > 0 || history.truncated || history.nextPageToken !== undefined)) return null;
  return {
    contractVersion: 3,
    state: candidate.state,
    scope,
    summary,
    ...(attribution ? { attribution } : {}),
    history: {
      role: expectedRole,
      items: items as ReferralWorkspaceHistoryItem[],
      ...(history.nextPageToken === undefined ? {} : { nextPageToken: history.nextPageToken }),
      truncated: history.truncated,
    },
  };
}

export async function getMyReferralWorkspace(request: ReferralWorkspaceRequest): Promise<ReferralWorkspace> {
  const input = record(request);
  const scope = record(input?.scope);
  const validKeys = input && Object.keys(input).every(key => ['scope', 'role', 'limit', 'pageToken'].includes(key));
  const validScope = scope && (scope.type === 'brand'
    ? Object.keys(scope).every(key => ['type', 'brandId'].includes(key)) && typeof scope.brandId === 'string' && scope.brandId.length > 0
    : (scope.type === 'client' || scope.type === 'freelancer') && Object.keys(scope).length === 1);
  const role = input?.role ?? 'inviter';
  if (!input || !validKeys || !validScope || (role !== 'inviter' && role !== 'invitee')
    || scope?.type !== 'client' && role === 'invitee'
    || input.limit !== undefined && (!Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 20)
    || input.pageToken !== undefined && (typeof input.pageToken !== 'string'
      || !REFERRAL_DOCUMENT_ID_PATTERN.test(input.pageToken))) {
    throw new Error('The referral workspace request is invalid');
  }
  const result = await getMyReferralWorkspaceCall(request);
  const workspace = parseReferralWorkspace(result.data, request);
  if (!workspace) throw new Error('The referral service returned an invalid workspace');
  return workspace;
}

export function appendReferralWorkspaceHistory(
  current: ReferralWorkspace,
  next: ReferralWorkspace,
): ReferralWorkspace {
  if (!sameReferralScope(current.scope, next.scope) || current.history.role !== next.history.role) {
    throw new Error('Referral workspace page has a different scope or role');
  }
  if (next.state !== 'ready' || next.summary.state !== 'verified') return next;
  return {
    ...next,
    history: { ...next.history, items: [...current.history.items, ...next.history.items] },
  };
}

export function referralWorkspaceMatchesSelection(
  workspace: ReferralWorkspace,
  scope: ReferralCodeScope,
  role: 'inviter' | 'invitee',
): boolean {
  return referralWorkspaceSelectionMatches(workspace.scope, workspace.history.role, scope, role);
}

export function referralWorkspaceSelectionMatches(
  leftScope: ReferralCodeScope,
  leftRole: 'inviter' | 'invitee',
  rightScope: ReferralCodeScope,
  rightRole: 'inviter' | 'invitee',
): boolean {
  return sameReferralScope(leftScope, rightScope) && leftRole === rightRole;
}

export function referralWorkspaceCanShare(
  workspace: ReferralWorkspace | null,
  scope: ReferralCodeScope,
  role: 'inviter' | 'invitee',
  code: string,
): boolean {
  return workspace?.state === 'ready'
    && workspace.summary.state === 'verified'
    && workspace.summary.currentCode?.code === code
    && workspace.summary.currentCode.status === 'active'
    && referralWorkspaceMatchesSelection(workspace, scope, role);
}

export function referralCreditSummary(
  totals: ReferralWorkspaceCreditTotal[],
): Array<ReferralWorkspaceCreditTotal & { amountMinor: number }> {
  return totals.map(total => ({ ...total, amountMinor: total.approvedMinor + total.pendingMinor }));
}

export async function createMyReferralCode(scope: ReferralCodeScope): Promise<CreatedReferralCode> {
  const result = await createMyReferralCodeCall({ scope });
  const candidate = record(result.data);
  if (
    !candidate
    || typeof candidate.code !== 'string'
    || candidate.ownerType !== scope.type
    || typeof candidate.programId !== 'string'
    || typeof candidate.reused !== 'boolean'
  ) throw new Error('The referral service returned an invalid code');
  return {
    code: candidate.code,
    ownerType: candidate.ownerType,
    programId: candidate.programId,
    reused: candidate.reused,
  };
}

export async function getPublicReferralCode(code: string): Promise<PublicReferralCode> {
  const result = await getPublicReferralCodeCall({ code });
  const candidate = record(result.data);
  if (!candidate || typeof candidate.code !== 'string' || candidate.status !== 'active') {
    throw new Error('The referral service returned an invalid public code');
  }
  return { code: candidate.code, status: 'active' };
}

export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/r/${encodeURIComponent(code)}`;
}

export function isActiveReferralCode(status: string): boolean {
  return status === 'active';
}

export function isShareableReferralCode(code: ReferralCode, verified: PublicReferralCode | null): boolean {
  return isActiveReferralCode(code.status) && verified?.status === 'active' && verified.code === code.code;
}

export function hasShareableReferralCode(codes: ReferralCode[], verifiedCodes: Record<string, boolean>): boolean {
  return codes.some(code => verifiedCodes[code.code] === true);
}

export async function recordVerifiedReferralVisit(code: string): Promise<boolean> {
  if (!referralAppCheckEnabled) return false;
  try {
    const result = await recordReferralVisitCall({ code });
    const value = record(result.data);
    return value?.code === code && value.status === 'active' && typeof value.recorded === 'boolean'
      ? value.recorded
      : false;
  } catch {
    return false;
  }
}

export function referralCodeScopeForSurface(
  surface: ReferralSurface,
  brandId?: string | null,
): ReferralCodeScope | null {
  if (surface === 'client') return { type: 'client' };
  if (surface === 'freelancer') return { type: 'freelancer' };
  return brandId ? { type: 'brand', brandId } : null;
}

export interface ReferralActionLock {
  current: string | null;
}

export async function runWithReferralActionLock(
  lock: ReferralActionLock,
  code: string,
  action: () => Promise<void>,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = code;
  try {
    await action();
    return true;
  } finally {
    lock.current = null;
  }
}

export function creditLabel({ amountMinor, currency }: Pick<ReferralReward, 'amountMinor' | 'currency'>): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function captureReferralAttribution(
  code: string,
  storage: Pick<Storage, 'setItem'>,
  now = Date.now(),
): StoredReferralAttribution | null {
  const normalizedCode = code.trim().toUpperCase();
  if (!REFERRAL_CODE_PATTERN.test(normalizedCode)) return null;
  const attribution = {
    code: normalizedCode,
    capturedAt: now,
    expiresAt: now + REFERRAL_ATTRIBUTION_TTL_MS,
  };
  storage.setItem(REFERRAL_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
}

export async function validateAndCaptureReferralCode(
  code: string,
  storageProvider: () => Pick<Storage, 'setItem'>,
  validate: (value: string) => Promise<PublicReferralCode> = getPublicReferralCode,
): Promise<StoredReferralAttribution | null> {
  const verified = await validate(code);
  try {
    return captureReferralAttribution(verified.code, storageProvider());
  } catch {
    throw new ReferralStorageUnavailableError();
  }
}

export function readCapturedReferralAttribution(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  now = Date.now(),
): StoredReferralAttribution | null {
  const clear = () => {
    try {
      storage.removeItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
    } catch {
      // A blocked storage area is equivalent to having no usable attribution.
    }
  };
  let raw: string | null;
  try {
    raw = storage.getItem(REFERRAL_ATTRIBUTION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const candidate = record(JSON.parse(raw));
    if (
      !candidate
      || typeof candidate.code !== 'string'
      || !Number.isFinite(candidate.capturedAt)
      || !Number.isFinite(candidate.expiresAt)
    ) {
      clear();
      return null;
    }
    const code = candidate.code.trim().toUpperCase();
    if (!REFERRAL_CODE_PATTERN.test(code) || code !== candidate.code || candidate.expiresAt <= now) {
      clear();
      return null;
    }
    return { code, capturedAt: candidate.capturedAt, expiresAt: candidate.expiresAt };
  } catch {
    clear();
    return null;
  }
}
