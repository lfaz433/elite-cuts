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
}

interface StoredReferralAttribution {
  code: string;
  capturedAt: number;
  expiresAt: number;
}

const getMyReferralWorkspaceCall = httpsCallable<Record<string, never>, unknown>(
  functions,
  'getMyReferralWorkspace',
);

export const REFERRAL_ATTRIBUTION_STORAGE_KEY = 'barberboard.referral-attribution';
export const REFERRAL_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  return {
    codes: candidate.codes.map(parseCode).filter((code): code is ReferralCode => code !== null),
    ...(attribution ? { attribution } : {}),
    rewards: candidate.rewards.map(parseReward).filter((reward): reward is ReferralReward => reward !== null),
  };
}

export async function getMyReferralWorkspace(): Promise<ReferralWorkspace> {
  const result = await getMyReferralWorkspaceCall({});
  const workspace = parseReferralWorkspace(result.data);
  if (!workspace) throw new Error('The referral service returned an invalid workspace');
  return workspace;
}

export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/r/${encodeURIComponent(code)}`;
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
  if (!/^[A-Z0-9-]{3,32}$/.test(normalizedCode)) return null;
  const attribution = {
    code: normalizedCode,
    capturedAt: now,
    expiresAt: now + REFERRAL_ATTRIBUTION_TTL_MS,
  };
  storage.setItem(REFERRAL_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
}
