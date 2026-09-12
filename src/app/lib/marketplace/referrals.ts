import { httpsCallable } from 'firebase/functions';
import { functions, referralAppCheckEnabled } from '../firebase';

export interface ReferralCode {
  code: string;
  ownerType: string;
  programId: string;
  status: string;
}

export interface ReferralReward {
  id: string;
  ownerType: ReferralSurface;
  role: 'inviter' | 'invited';
  amountMinor: number;
  currency: string;
  status: string;
}

export interface ReferralWorkspace {
  client: ReferralClientWorkspace;
  freelancer: ReferralFreelancerWorkspace;
  brandWorkspaces?: ReferralBrandWorkspace[];
}

export interface ReferralClientWorkspace {
  ownerType: 'client';
  codes: ReferralCode[];
  attribution?: {
    code: string;
    programId: string;
  };
  inviterRewards: ReferralReward[];
  inviteeRewards: ReferralReward[];
}

export interface ReferralFreelancerWorkspace {
  ownerType: 'freelancer';
  codes: ReferralCode[];
  inviterRewards: ReferralReward[];
}

export interface ReferralBrandWorkspace {
  ownerType: 'brand';
  brandId: string;
  codes: ReferralCode[];
  rewards: ReferralReward[];
  creditTotals: ReferralCreditTotal[];
}

export interface ReferralCreditTotal {
  currency: string;
  approvedMinor: number;
  pendingMinor: number;
}

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

export interface ReferralWorkspaceScope {
  codes: ReferralCode[];
  rewards: ReferralReward[];
  attribution?: ReferralClientWorkspace['attribution'];
  creditTotals?: ReferralCreditTotal[];
}

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

const getMyReferralWorkspaceCall = httpsCallable<Record<string, never>, unknown>(
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

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseCode(value: unknown, expectedOwnerType: ReferralSurface): ReferralCode | null {
  const candidate = record(value);
  if (
    !candidate
    || typeof candidate.code !== 'string'
    || candidate.ownerType !== expectedOwnerType
    || typeof candidate.programId !== 'string'
    || typeof candidate.status !== 'string'
  ) return null;
  return {
    code: candidate.code,
    ownerType: expectedOwnerType,
    programId: candidate.programId,
    status: candidate.status,
  };
}

function parseReward(
  value: unknown,
  expectedOwnerType: ReferralSurface,
  expectedRole: ReferralReward['role'],
): ReferralReward | null {
  const candidate = record(value);
  if (
    !candidate
    || typeof candidate.id !== 'string'
    || candidate.ownerType !== expectedOwnerType
    || candidate.role !== expectedRole
    || typeof candidate.amountMinor !== 'number'
    || !Number.isInteger(candidate.amountMinor)
    || candidate.amountMinor < 0
    || typeof candidate.currency !== 'string'
    || typeof candidate.status !== 'string'
  ) return null;
  return {
    id: candidate.id,
    ownerType: expectedOwnerType,
    role: expectedRole,
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    status: candidate.status,
  };
}

function parseCodes(value: unknown, expectedOwnerType: ReferralSurface): ReferralCode[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(code => parseCode(code, expectedOwnerType)).filter((code): code is ReferralCode => code !== null);
}

function parseRewards(
  value: unknown,
  expectedOwnerType: ReferralSurface,
  expectedRole: ReferralReward['role'],
): ReferralReward[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(reward => parseReward(reward, expectedOwnerType, expectedRole))
    .filter((reward): reward is ReferralReward => reward !== null);
}

function parseCreditTotals(value: unknown): ReferralCreditTotal[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap(value => {
    const total = record(value);
    if (
      !total
      || typeof total.currency !== 'string'
      || !Number.isSafeInteger(total.approvedMinor)
      || !Number.isSafeInteger(total.pendingMinor)
      || total.approvedMinor < 0
      || total.pendingMinor < 0
    ) return [];
    return [{ currency: total.currency, approvedMinor: total.approvedMinor, pendingMinor: total.pendingMinor }];
  });
}

function parseReferralWorkspace(value: unknown): ReferralWorkspace | null {
  const candidate = record(value);
  const client = record(candidate?.client);
  const freelancer = record(candidate?.freelancer);
  if (!candidate || !client || !freelancer || client.ownerType !== 'client' || freelancer.ownerType !== 'freelancer') return null;
  const attributionRecord = record(client.attribution);
  const attribution = attributionRecord
    && typeof attributionRecord.code === 'string'
    && typeof attributionRecord.programId === 'string'
    ? { code: attributionRecord.code, programId: attributionRecord.programId }
    : undefined;
  const clientCodes = parseCodes(client.codes, 'client');
  const clientInviterRewards = parseRewards(client.inviterRewards, 'client', 'inviter');
  const clientInviteeRewards = parseRewards(client.inviteeRewards, 'client', 'invited');
  const freelancerCodes = parseCodes(freelancer.codes, 'freelancer');
  const freelancerInviterRewards = parseRewards(freelancer.inviterRewards, 'freelancer', 'inviter');
  if (!clientCodes || !clientInviterRewards || !clientInviteeRewards || !freelancerCodes || !freelancerInviterRewards) return null;
  const brandWorkspaces = Array.isArray(candidate.brandWorkspaces)
    ? candidate.brandWorkspaces.map(value => {
      const workspace = record(value);
      if (!workspace || workspace.ownerType !== 'brand' || typeof workspace.brandId !== 'string') return null;
      const codes = parseCodes(workspace.codes, 'brand');
      const rewards = parseRewards(workspace.rewards, 'brand', 'inviter');
      const creditTotals = parseCreditTotals(workspace.creditTotals);
      if (!codes || !rewards || !creditTotals) return null;
      return {
        ownerType: 'brand' as const,
        brandId: workspace.brandId,
        codes,
        rewards,
        creditTotals,
      };
    }).filter((workspace): workspace is ReferralBrandWorkspace => workspace !== null)
    : undefined;
  return {
    client: {
      ownerType: 'client',
      codes: clientCodes,
      ...(attribution ? { attribution } : {}),
      inviterRewards: clientInviterRewards,
      inviteeRewards: clientInviteeRewards,
    },
    freelancer: {
      ownerType: 'freelancer',
      codes: freelancerCodes,
      inviterRewards: freelancerInviterRewards,
    },
    ...(brandWorkspaces && brandWorkspaces.length > 0 ? { brandWorkspaces } : {}),
  };
}

export async function getMyReferralWorkspace(): Promise<ReferralWorkspace> {
  const result = await getMyReferralWorkspaceCall({});
  const workspace = parseReferralWorkspace(result.data);
  if (!workspace) throw new Error('The referral service returned an invalid workspace');
  return workspace;
}

export async function createMyReferralCode(scope: ReferralCodeScope): Promise<CreatedReferralCode> {
  const result = await createMyReferralCodeCall({ scope });
  const candidate = record(result.data);
  if (
    !candidate
    || typeof candidate.code !== 'string'
    || (candidate.ownerType !== 'client' && candidate.ownerType !== 'freelancer' && candidate.ownerType !== 'brand')
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

export function referralWorkspaceForScope(
  workspace: ReferralWorkspace,
  surface: ReferralSurface,
  brandId?: string | null,
): ReferralWorkspaceScope {
  if (surface === 'brand') {
    const brandWorkspace = workspace.brandWorkspaces?.find(brand => brand.brandId === brandId);
    return brandWorkspace
      ? { codes: brandWorkspace.codes, rewards: brandWorkspace.rewards, creditTotals: brandWorkspace.creditTotals }
      : { codes: [], rewards: [] };
  }
  if (surface === 'client') {
    return {
      codes: workspace.client.codes,
      rewards: [...workspace.client.inviterRewards, ...workspace.client.inviteeRewards],
      ...(workspace.client.attribution ? { attribution: workspace.client.attribution } : {}),
    };
  }
  return { codes: workspace.freelancer.codes, rewards: workspace.freelancer.inviterRewards };
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
