import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface ReferralCode {
  code: string;
  ownerType: string;
  programId: string;
  status: string;
}

export interface ReferralReward {
  id: string;
  role: 'inviter' | 'invited';
  amountMinor: number;
  currency: string;
  status: string;
}

export interface ReferralWorkspace {
  codes: ReferralCode[];
  attribution?: {
    code: string;
    programId: string;
  };
  rewards: ReferralReward[];
  brandWorkspaces?: ReferralBrandWorkspace[];
}

export interface ReferralBrandWorkspace {
  brandId: string;
  codes: ReferralCode[];
  rewards: ReferralReward[];
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

export interface ReferralWorkspaceScope {
  codes: ReferralCode[];
  rewards: ReferralReward[];
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
const createMyReferralCodeCall = httpsCallable<Record<string, never>, unknown>(functions, 'createMyReferralCode');
const getPublicReferralCodeCall = httpsCallable<{ code: string }, unknown>(functions, 'getPublicReferralCode');

export const REFERRAL_ATTRIBUTION_STORAGE_KEY = 'barberboard.referral-attribution';
export const REFERRAL_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseCode(value: unknown): ReferralCode | null {
  const candidate = record(value);
  if (
    !candidate
    || typeof candidate.code !== 'string'
    || typeof candidate.ownerType !== 'string'
    || typeof candidate.programId !== 'string'
    || typeof candidate.status !== 'string'
  ) return null;
  return {
    code: candidate.code,
    ownerType: candidate.ownerType,
    programId: candidate.programId,
    status: candidate.status,
  };
}

function parseReward(value: unknown): ReferralReward | null {
  const candidate = record(value);
  if (
    !candidate
    || typeof candidate.id !== 'string'
    || (candidate.role !== 'inviter' && candidate.role !== 'invited')
    || typeof candidate.amountMinor !== 'number'
    || !Number.isInteger(candidate.amountMinor)
    || candidate.amountMinor < 0
    || typeof candidate.currency !== 'string'
    || typeof candidate.status !== 'string'
  ) return null;
  return {
    id: candidate.id,
    role: candidate.role,
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    status: candidate.status,
  };
}

function parseReferralWorkspace(value: unknown): ReferralWorkspace | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.codes) || !Array.isArray(candidate.rewards)) return null;
  const attributionRecord = record(candidate.attribution);
  const attribution = attributionRecord
    && typeof attributionRecord.code === 'string'
    && typeof attributionRecord.programId === 'string'
    ? { code: attributionRecord.code, programId: attributionRecord.programId }
    : undefined;
  const brandWorkspaces = Array.isArray(candidate.brandWorkspaces)
    ? candidate.brandWorkspaces.map(value => {
      const workspace = record(value);
      if (!workspace || typeof workspace.brandId !== 'string' || !Array.isArray(workspace.codes) || !Array.isArray(workspace.rewards)) return null;
      return {
        brandId: workspace.brandId,
        codes: workspace.codes.map(parseCode).filter((code): code is ReferralCode => code !== null),
        rewards: workspace.rewards.map(parseReward).filter((reward): reward is ReferralReward => reward !== null),
      };
    }).filter((workspace): workspace is ReferralBrandWorkspace => workspace !== null)
    : undefined;
  return {
    codes: candidate.codes.map(parseCode).filter((code): code is ReferralCode => code !== null),
    ...(attribution ? { attribution } : {}),
    rewards: candidate.rewards.map(parseReward).filter((reward): reward is ReferralReward => reward !== null),
    ...(brandWorkspaces && brandWorkspaces.length > 0 ? { brandWorkspaces } : {}),
  };
}

export async function getMyReferralWorkspace(): Promise<ReferralWorkspace> {
  const result = await getMyReferralWorkspaceCall({});
  const workspace = parseReferralWorkspace(result.data);
  if (!workspace) throw new Error('The referral service returned an invalid workspace');
  return workspace;
}

export async function createMyReferralCode(): Promise<CreatedReferralCode> {
  const result = await createMyReferralCodeCall({});
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

export function referralWorkspaceForScope(
  workspace: ReferralWorkspace,
  surface: ReferralSurface,
  brandId?: string | null,
): ReferralWorkspaceScope {
  if (surface === 'brand') {
    const brandWorkspace = workspace.brandWorkspaces?.find(brand => brand.brandId === brandId);
    return brandWorkspace ? { codes: brandWorkspace.codes, rewards: brandWorkspace.rewards } : { codes: [], rewards: [] };
  }
  const hasAnotherPersonalScope = workspace.codes.some(code => (
    (code.ownerType === 'client' || code.ownerType === 'freelancer') && code.ownerType !== surface
  ));
  return {
    codes: workspace.codes.filter(code => code.ownerType === surface),
    rewards: hasAnotherPersonalScope ? [] : workspace.rewards,
  };
}

export function canCreateReferralCodeForScope(
  workspace: ReferralWorkspace,
  surface: ReferralSurface,
  brandId?: string | null,
): boolean {
  if (surface === 'brand') {
    return workspace.brandWorkspaces?.length === 1 && workspace.brandWorkspaces[0].brandId === brandId;
  }
  return (workspace.brandWorkspaces?.length ?? 0) === 0;
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
  storage: Pick<Storage, 'setItem'>,
  validate: (value: string) => Promise<PublicReferralCode> = getPublicReferralCode,
): Promise<StoredReferralAttribution | null> {
  const verified = await validate(code);
  try {
    return captureReferralAttribution(verified.code, storage);
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
