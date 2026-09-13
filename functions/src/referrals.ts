import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { randomBytes } from 'node:crypto';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type RewardStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
type ProgramStatus = 'draft' | 'active' | 'paused' | 'archived';
type OwnerType = 'client' | 'freelancer' | 'brand';
type ReferralCodeScope =
  | { type: 'client' }
  | { type: 'freelancer' }
  | { type: 'brand'; brandId: string };

export type ReferralWorkspaceScope = ReferralCodeScope;

export interface ReferralWorkspaceCreditTotal {
  currency: string;
  pendingMinor: number;
  approvedMinor: number;
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
  ownerType: OwnerType;
  currentCode?: { code: string; programId: string; status: string };
  codeCount: number;
  attributionCount: number;
  inviter: ReferralWorkspaceRoleSummary;
  invitee: ReferralWorkspaceRoleSummary;
  state: 'verified' | 'unavailable';
}

export interface ReferralWorkspaceHistoryItem {
  id: string;
  ownerType: OwnerType;
  role: 'inviter' | 'invitee';
  amountMinor: number;
  currency: string;
  status: RewardStatus;
  createdAt?: string;
}

export interface ReferralWorkspaceV3 {
  contractVersion: 3;
  scope: ReferralWorkspaceScope;
  summary: ReferralWorkspaceSummary;
  attribution?: { code: string; programId: string; inviterOwnerType: OwnerType; expiresAt: string };
  history: {
    role: 'inviter' | 'invitee';
    items: ReferralWorkspaceHistoryItem[];
    nextPageToken?: string;
    truncated: boolean;
  };
}

export interface ReferralCompletionEvidence {
  version: 1;
  eventId: string;
  updateTimeMs: number;
}

export interface PublicReferralVisitResult {
  code: string;
  status: 'active';
  recorded: boolean;
}

export interface ReferralProgramOverview {
  id: string;
  status: ProgramStatus;
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: string;
  endsAt: string;
}

export interface ReferralCreditTotal {
  currency: string;
  amountMinor: number;
}

export interface ReferralFraudFlag {
  status: 'flagged' | 'cleared';
  reason: string;
}

export interface ReferralPendingRewardOverview {
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
  fraudFlag?: ReferralFraudFlag;
}

export interface ReferralAuditEntry {
  id: string;
  action: string;
  programId?: string;
  rewardId?: string;
  code?: string;
  actorUid?: string;
  reason?: string;
  createdAt?: string;
}

export interface ReferralTopReferrer {
  inviterId: string;
  inviterOwnerType: OwnerType;
  referrals: number;
  rewards: number;
  approvedCreditTotals: ReferralCreditTotal[];
}

export interface ReferralOverviewPage<T> {
  items: T[];
  nextPageToken?: string;
  truncated: boolean;
}

export type ReferralAuditFilter =
  | { limit?: number; code?: never; programId?: never; rewardId?: never; action?: never }
  | { code: string; limit?: number; programId?: never; rewardId?: never; action?: never }
  | { programId: string; limit?: number; code?: never; rewardId?: never; action?: never }
  | { rewardId: string; limit?: number; code?: never; programId?: never; action?: never }
  | { action: string; limit?: number; code?: never; programId?: never; rewardId?: never };

export type ReferralMarketingOverviewRequest = ReferralAuditFilter & {
  auditLimit?: number;
  auditPageToken?: string;
  programLimit?: number;
  programPageToken?: string;
  pendingLimit?: number;
  pendingPageToken?: string;
  flaggedLimit?: number;
  flaggedPageToken?: string;
};

export interface ReferralMarketingOverview {
  contractVersion: 3;
  state: 'ready' | 'migrationRequired';
  summaryEpoch: string;
  telemetry: { state: 'verified' | 'unavailable'; validatedVisits: number; capped: boolean };
  programs: ReferralOverviewPage<ReferralProgramOverview>;
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
  approvedCreditTotals: ReferralCreditTotal[];
  topReferrers: ReferralOverviewPage<ReferralTopReferrer>;
  pendingRewards: ReferralOverviewPage<ReferralPendingRewardOverview>;
  flaggedRewards: ReferralOverviewPage<ReferralPendingRewardOverview & { fraudFlag: { status: 'flagged'; reason: string } }>;
  auditTrail: ReferralOverviewPage<ReferralAuditEntry>;
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PROGRAM_STATE_ID = 'active';
const MAX_CODE_GENERATION_ATTEMPTS = 8;
const MAX_REFERRAL_AUDIT_RESULTS = 50;
const DEFAULT_REFERRAL_AUDIT_RESULTS = 20;
const MAX_OVERVIEW_PAGE_RESULTS = 20;
const DEFAULT_OVERVIEW_PAGE_RESULTS = 10;
const TOP_REFERRER_RESULTS = 10;
const MAX_VALIDATED_VISITS_PER_CODE = 10_000;
const MAX_VALIDATED_VISITS_TOTAL = 1_000_000;
const REFERRAL_ELIGIBILITY_EVIDENCE_VERSION = 1;
const MAX_WORKSPACE_HISTORY_RESULTS = 20;
const DEFAULT_WORKSPACE_HISTORY_RESULTS = 10;
const REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION = 1;
const REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION = 1;
const REFERRAL_CANONICAL_SUMMARY_VERSION = 1;
// Fresh staging rollout marker. Rows without this exact server-selected epoch are
// quarantined rather than being interpreted as a zero-valued legacy workspace.
const REFERRAL_SUMMARY_EPOCH = 'referral-v3';
const SUPPORTED_REFERRAL_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD']);
const DOCUMENT_ID_FIELD_PATH = admin.firestore.FieldPath.documentId();

export const referralVisitCallableOptions = {
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  maxInstances: 2,
};

export function canRecordReferralVisit(appCheck: { alreadyConsumed?: boolean } | undefined): boolean {
  return appCheck !== undefined && appCheck.alreadyConsumed !== true;
}

function error(code: functions.https.FunctionsErrorCode, message: string): never {
  throw new functions.https.HttpsError(code, message);
}

function record(value: unknown, allowedKeys: readonly string[], message: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) error('invalid-argument', message);
  const parsed = value as RecordValue;
  if (Object.keys(parsed).some(key => !allowedKeys.includes(key))) error('invalid-argument', message);
  return parsed;
}

function documentId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DOCUMENT_ID_PATTERN.test(value)) {
    error('invalid-argument', `${field} is invalid`);
  }
  return value;
}

function nonNegativeMinor(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) {
    error('invalid-argument', `${field} is invalid`);
  }
  return value as number;
}

function isoCountry(value: unknown, field: string): string {
  if (typeof value !== 'string' || !COUNTRY_PATTERN.test(value.trim().toUpperCase())) {
    error('invalid-argument', `${field} is invalid`);
  }
  return value.trim().toUpperCase();
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const parsed = toMillis.call(value);
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function timestampIso(value: unknown): string | undefined {
  const milliseconds = timestampMs(value);
  return milliseconds === undefined ? undefined : new Date(milliseconds).toISOString();
}

function dateInput(value: unknown, field: string): string {
  if (typeof value !== 'string') error('invalid-argument', `${field} is invalid`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) error('invalid-argument', `${field} is invalid`);
  return new Date(parsed).toISOString();
}

function validProgram(program: RecordValue | undefined, countryCode: string, now: Date): boolean {
  if (!program || program.status !== 'active') return false;
  if (!Array.isArray(program.countryCodes) || !program.countryCodes.includes(countryCode)) return false;
  const start = timestampMs(program.startsAt);
  const end = timestampMs(program.endsAt);
  if (start === undefined || end === undefined || start > now.getTime() || end < now.getTime()) return false;
  return typeof program.currency === 'string'
    && SUPPORTED_REFERRAL_CURRENCIES.has(program.currency)
    && Number.isSafeInteger(program.inviterCreditMinor)
    && (program.inviterCreditMinor as number) >= 0
    && Number.isSafeInteger(program.invitedDiscountMinor)
    && (program.invitedDiscountMinor as number) >= 0;
}

function isPositivePaidBooking(booking: RecordValue | undefined): booking is RecordValue {
  return booking?.status === 'completed'
    && booking.isTest !== true
    && booking.paymentStatus === 'paid'
    && Number.isSafeInteger(booking.pricePaidMinor)
    && (booking.pricePaidMinor as number) > 0;
}

function positivePaidCompletionAt(booking: RecordValue | undefined): number | undefined {
  if (!isPositivePaidBooking(booking)) return undefined;
  const completedAt = timestampMs(booking.completedAt);
  return completedAt !== undefined && Number.isSafeInteger(completedAt) ? completedAt : undefined;
}

function earliestPositivePaidCompletion(
  bookings: Array<{ id: string; data(): RecordValue }>,
): { id: string; completedAtMs: number } | null {
  const eligible: Array<{ id: string; completedAtMs: number }> = [];
  for (const snapshot of bookings) {
    const booking = snapshot.data();
    if (!isPositivePaidBooking(booking)) continue;
    const completedAtMs = positivePaidCompletionAt(booking);
    if (completedAtMs === undefined) return null;
    eligible.push({ id: snapshot.id, completedAtMs });
  }
  return eligible.sort((left, right) => (
    left.completedAtMs - right.completedAtMs || left.id.localeCompare(right.id)
  ))[0] ?? null;
}

function referralCompletionEvidence(value: unknown): ReferralCompletionEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const evidence = value as RecordValue;
  if (
    evidence.version !== REFERRAL_ELIGIBILITY_EVIDENCE_VERSION
    || typeof evidence.eventId !== 'string' || evidence.eventId.length === 0 || evidence.eventId.length > 512
    || !Number.isSafeInteger(evidence.updateTimeMs) || (evidence.updateTimeMs as number) < 0
  ) return null;
  return {
    version: REFERRAL_ELIGIBILITY_EVIDENCE_VERSION,
    eventId: evidence.eventId,
    updateTimeMs: evidence.updateTimeMs as number,
  };
}

function programEligibilityEvidence(program: RecordValue | undefined): {
  version: number;
  notBeforeAtMs: number;
} | null {
  const notBeforeAtMs = timestampMs(program?.eligibilityEvidenceNotBeforeAt);
  const startsAtMs = timestampMs(program?.startsAt);
  if (
    program?.eligibilityEvidenceVersion !== REFERRAL_ELIGIBILITY_EVIDENCE_VERSION
    || notBeforeAtMs === undefined || startsAtMs === undefined
  ) return null;
  return {
    version: REFERRAL_ELIGIBILITY_EVIDENCE_VERSION,
    notBeforeAtMs: Math.max(notBeforeAtMs, startsAtMs),
  };
}

function isTrustedCompletionEvidence(
  evidence: ReferralCompletionEvidence | null,
  completedAtMs: number | undefined,
  programEvidence: { version: number; notBeforeAtMs: number } | null,
): evidence is ReferralCompletionEvidence {
  return evidence !== null && completedAtMs !== undefined && programEvidence !== null
    && completedAtMs >= programEvidence.notBeforeAtMs
    && evidence.updateTimeMs >= completedAtMs
    && evidence.updateTimeMs >= programEvidence.notBeforeAtMs;
}

function ownerType(value: unknown): OwnerType | null {
  return value === 'client' || value === 'freelancer' || value === 'brand' ? value : null;
}

function samePrincipal(
  leftId: unknown,
  leftType: unknown,
  rightId: unknown,
  rightType: unknown,
): boolean {
  return typeof leftId === 'string' && typeof rightId === 'string'
    && leftId === rightId && ownerType(leftType) === ownerType(rightType);
}

type TrustedReferralQualification = {
  rewardId: string;
  programId: string;
  bookingId: string;
  code: string;
  inviterId: string;
  inviterOwnerId: string;
  inviterOwnerType: OwnerType;
  invitedUserId: string;
  invitedOwnerId: string;
  invitedOwnerType: 'client';
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  eligibleCompletedAtMs: number;
  eligibilityEvidenceVersion: number;
  eligibilityEvidenceEventId: string;
  eligibilityEvidenceUpdateTimeMs: number;
  eligibilityProgramNotBeforeAtMs: number;
};

function qualificationMatchesRecord(recordValue: RecordValue | undefined, qualification: TrustedReferralQualification): boolean {
  return recordValue !== undefined
    && Object.entries(qualification).every(([key, value]) => recordValue[key] === value);
}

function trustedQualificationFromEvidence(evidence: RecordValue | undefined): TrustedReferralQualification | null {
  if (!evidence
    || typeof evidence.rewardId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.rewardId)
    || typeof evidence.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.programId)
    || typeof evidence.bookingId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.bookingId)
    || typeof evidence.code !== 'string' || !CODE_PATTERN.test(evidence.code)
    || typeof evidence.inviterId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.inviterId)
    || typeof evidence.inviterOwnerId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.inviterOwnerId)
    || !ownerType(evidence.inviterOwnerType)
    || typeof evidence.invitedUserId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.invitedUserId)
    || typeof evidence.invitedOwnerId !== 'string' || !DOCUMENT_ID_PATTERN.test(evidence.invitedOwnerId)
    || evidence.invitedOwnerType !== 'client'
    || typeof evidence.currency !== 'string' || !CURRENCY_PATTERN.test(evidence.currency)
    || !Number.isSafeInteger(evidence.inviterCreditMinor) || (evidence.inviterCreditMinor as number) < 0
    || !Number.isSafeInteger(evidence.invitedDiscountMinor) || (evidence.invitedDiscountMinor as number) < 0
    || !Number.isSafeInteger(evidence.eligibleCompletedAtMs)
    || evidence.eligibilityEvidenceVersion !== REFERRAL_ELIGIBILITY_EVIDENCE_VERSION
    || typeof evidence.eligibilityEvidenceEventId !== 'string' || evidence.eligibilityEvidenceEventId.length === 0
    || !Number.isSafeInteger(evidence.eligibilityEvidenceUpdateTimeMs)
    || !Number.isSafeInteger(evidence.eligibilityProgramNotBeforeAtMs)
  ) return null;
  return {
    rewardId: evidence.rewardId,
    programId: evidence.programId,
    bookingId: evidence.bookingId,
    code: evidence.code,
    inviterId: evidence.inviterId,
    inviterOwnerId: evidence.inviterOwnerId,
    inviterOwnerType: evidence.inviterOwnerType as OwnerType,
    invitedUserId: evidence.invitedUserId,
    invitedOwnerId: evidence.invitedOwnerId,
    invitedOwnerType: 'client',
    currency: evidence.currency,
    inviterCreditMinor: evidence.inviterCreditMinor as number,
    invitedDiscountMinor: evidence.invitedDiscountMinor as number,
    eligibleCompletedAtMs: evidence.eligibleCompletedAtMs as number,
    eligibilityEvidenceVersion: REFERRAL_ELIGIBILITY_EVIDENCE_VERSION,
    eligibilityEvidenceEventId: evidence.eligibilityEvidenceEventId,
    eligibilityEvidenceUpdateTimeMs: evidence.eligibilityEvidenceUpdateTimeMs as number,
    eligibilityProgramNotBeforeAtMs: evidence.eligibilityProgramNotBeforeAtMs as number,
  };
}

function hasCanonicalUserIdentity(profile: RecordValue | undefined, uid: string): boolean {
  return profile?.uid === uid;
}

function hasCompatibleLegacyRole(profile: RecordValue | undefined, allowedRoles: string[]): boolean {
  return profile?.role === undefined || allowedRoles.includes(profile.role as string);
}

function isEligiblePersonalReferralIdentity(
  profile: RecordValue | undefined,
  uid: string,
  allowedLegacyRoles: string[],
): boolean {
  return hasCanonicalUserIdentity(profile, uid)
    && profile?.platformAdmin !== true
    && hasCompatibleLegacyRole(profile, allowedLegacyRoles);
}

function referralCodeScope(value: unknown): ReferralCodeScope {
  const input = record(value, ['scope'], 'Referral code scope is invalid');
  const scope = record(input.scope, ['type', 'brandId'], 'Referral code scope is invalid');
  if (scope.type === 'client' || scope.type === 'freelancer') {
    if (scope.brandId !== undefined) error('invalid-argument', 'Referral code scope is invalid');
    return { type: scope.type };
  }
  if (scope.type === 'brand') return { type: 'brand', brandId: documentId(scope.brandId, 'brandId') };
  error('invalid-argument', 'Referral code scope is invalid');
}

function referralWorkspaceInput(value: unknown): {
  scope: ReferralWorkspaceScope;
  role: 'inviter' | 'invitee';
  limit: number;
  pageToken?: string;
} {
  const input = record(value, ['scope', 'role', 'limit', 'pageToken'], 'Referral workspace input is invalid');
  const scope = referralCodeScope({ scope: input.scope });
  const role = input.role === undefined ? 'inviter' : input.role;
  if (role !== 'inviter' && role !== 'invitee') error('invalid-argument', 'Referral workspace role is invalid');
  if (scope.type !== 'client' && role === 'invitee') {
    error('invalid-argument', 'Only the client workspace has invitee history');
  }
  const limit = input.limit === undefined ? DEFAULT_WORKSPACE_HISTORY_RESULTS : input.limit;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_WORKSPACE_HISTORY_RESULTS) {
    error('invalid-argument', 'Referral workspace limit is invalid');
  }
  return {
    scope,
    role,
    limit: limit as number,
    ...(input.pageToken === undefined ? {} : { pageToken: documentId(input.pageToken, 'pageToken') }),
  };
}

function referralCodeLookup(value: unknown): { code: string; countryCode: string } {
  const input = record(value, ['code', 'countryCode'], 'Referral code lookup is invalid');
  return {
    code: normalizeReferralCode(input.code),
    countryCode: input.countryCode === undefined ? 'FR' : isoCountry(input.countryCode, 'countryCode'),
  };
}

type ReferralMarketingOverviewInput = {
  code?: string;
  programId?: string;
  rewardId?: string;
  action?: string;
  programLimit: number;
  programPageToken?: string;
  pendingLimit: number;
  pendingPageToken?: string;
  flaggedLimit: number;
  flaggedPageToken?: string;
  auditLimit: number;
  auditPageToken?: string;
};

function overviewLimit(value: unknown, field: string, maximum = MAX_OVERVIEW_PAGE_RESULTS, fallback = DEFAULT_OVERVIEW_PAGE_RESULTS): number {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || (result as number) < 1 || (result as number) > maximum) {
    error('invalid-argument', `${field} is invalid`);
  }
  return result as number;
}

function referralMarketingOverviewInput(value: unknown): ReferralMarketingOverviewInput {
  const input = record(value, [
    'code', 'programId', 'rewardId', 'action', 'limit', 'auditLimit', 'auditPageToken',
    'programLimit', 'programPageToken', 'pendingLimit', 'pendingPageToken', 'flaggedLimit', 'flaggedPageToken',
  ], 'Referral marketing overview filters are invalid');
  const filterCount = ['code', 'programId', 'rewardId', 'action'].filter(key => input[key] !== undefined).length;
  if (filterCount > 1) error('invalid-argument', 'Only one referral audit filter may be used');
  const code = input.code === undefined ? undefined : normalizeReferralCode(input.code);
  const programId = input.programId === undefined ? undefined : documentId(input.programId, 'programId');
  const rewardId = input.rewardId === undefined ? undefined : documentId(input.rewardId, 'rewardId');
  let action: string | undefined;
  if (input.action !== undefined) {
    if (typeof input.action !== 'string' || !/^REFERRAL_[A-Z_]{3,64}$/.test(input.action)) {
      error('invalid-argument', 'action is invalid');
    }
    action = input.action;
  }
  if (input.limit !== undefined && input.auditLimit !== undefined && input.limit !== input.auditLimit) {
    error('invalid-argument', 'auditLimit is invalid');
  }
  const auditLimit = overviewLimit(
    input.auditLimit ?? input.limit,
    'auditLimit',
    MAX_REFERRAL_AUDIT_RESULTS,
    DEFAULT_REFERRAL_AUDIT_RESULTS,
  );
  return {
    ...(code ? { code } : {}),
    ...(programId ? { programId } : {}),
    ...(rewardId ? { rewardId } : {}),
    ...(action ? { action } : {}),
    programLimit: overviewLimit(input.programLimit, 'programLimit'),
    pendingLimit: overviewLimit(input.pendingLimit, 'pendingLimit'),
    flaggedLimit: overviewLimit(input.flaggedLimit, 'flaggedLimit'),
    auditLimit,
    ...(input.programPageToken === undefined ? {} : { programPageToken: documentId(input.programPageToken, 'programPageToken') }),
    ...(input.pendingPageToken === undefined ? {} : { pendingPageToken: documentId(input.pendingPageToken, 'pendingPageToken') }),
    ...(input.flaggedPageToken === undefined ? {} : { flaggedPageToken: documentId(input.flaggedPageToken, 'flaggedPageToken') }),
    ...(input.auditPageToken === undefined ? {} : { auditPageToken: documentId(input.auditPageToken, 'auditPageToken') }),
  };
}

function referralRewardFlagInput(value: unknown): { rewardId: string; flagged: boolean; reason: string } {
  const input = record(value, ['rewardId', 'flagged', 'reason'], 'Referral reward flag is invalid');
  if (typeof input.flagged !== 'boolean') error('invalid-argument', 'flagged is invalid');
  if (typeof input.reason !== 'string' || input.reason.trim() === '' || input.reason.length > 500) {
    error('invalid-argument', 'reason is invalid');
  }
  return { rewardId: documentId(input.rewardId, 'rewardId'), flagged: input.flagged, reason: input.reason.trim() };
}

function generatedReferralCode(): string {
  return `EC-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function callerUid(caller: string | null): string {
  if (!caller || !DOCUMENT_ID_PATTERN.test(caller)) error('unauthenticated', 'Authentication is required');
  return caller;
}

async function requireSuperAdmin(
  uid: string,
  firestore: Firestore,
  verifiedPlatformAdmin: boolean,
): Promise<void> {
  if (verifiedPlatformAdmin) return;
  const profile = (await firestore.collection('users').doc(uid).get()).data() as RecordValue | undefined;
  if (profile?.role !== 'superadmin' && profile?.platformAdmin !== true) {
    error('permission-denied', 'Super Admin permission is required');
  }
}

function activeProgramInput(value: unknown, currentTime: Date): {
  programId?: string;
  status: ProgramStatus;
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: string;
  endsAt: string;
} {
  const input = record(value, [
    'programId', 'status', 'countryCodes', 'currency', 'inviterCreditMinor', 'invitedDiscountMinor', 'startsAt', 'endsAt',
  ], 'Referral program is invalid');
  const status = input.status;
  if (status !== 'draft' && status !== 'active' && status !== 'paused' && status !== 'archived') {
    error('invalid-argument', 'status is invalid');
  }
  if (!Array.isArray(input.countryCodes) || input.countryCodes.length === 0 || input.countryCodes.length > 25) {
    error('invalid-argument', 'countryCodes is invalid');
  }
  const countryCodes = input.countryCodes.map(country => isoCountry(country, 'countryCodes'));
  if (new Set(countryCodes).size !== countryCodes.length) error('invalid-argument', 'countryCodes contains duplicates');
  if (typeof input.currency !== 'string' || !SUPPORTED_REFERRAL_CURRENCIES.has(input.currency.trim().toUpperCase())) {
    error('invalid-argument', 'currency is invalid');
  }
  const startsAt = dateInput(input.startsAt, 'startsAt');
  const endsAt = dateInput(input.endsAt, 'endsAt');
  if (Date.parse(startsAt) > Date.parse(endsAt)) error('invalid-argument', 'Referral program date range is invalid');
  if (status === 'active' && (Date.parse(startsAt) > currentTime.getTime() || Date.parse(endsAt) < currentTime.getTime())) {
    error('failed-precondition', 'An active referral program must be available now');
  }
  return {
    ...(input.programId === undefined ? {} : { programId: documentId(input.programId, 'programId') }),
    status,
    countryCodes,
    currency: input.currency.trim().toUpperCase(),
    inviterCreditMinor: nonNegativeMinor(input.inviterCreditMinor, 'inviterCreditMinor'),
    invitedDiscountMinor: nonNegativeMinor(input.invitedDiscountMinor, 'invitedDiscountMinor'),
    startsAt,
    endsAt,
  };
}

export function normalizeReferralCode(value: unknown): string {
  if (typeof value !== 'string') error('invalid-argument', 'Referral code is invalid');
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) error('invalid-argument', 'Referral code is invalid');
  return code;
}

const PLATFORM_COUNT_FIELDS = [
  'programCount', 'codeCount', 'attributionCount', 'rewardCount', 'pendingRewardCount',
  'approvedRewardCount', 'rejectedRewardCount', 'cancelledRewardCount', 'flaggedPendingRewardCount',
] as const;

type PlatformCountField = typeof PLATFORM_COUNT_FIELDS[number];
type ProgramCountField = Exclude<PlatformCountField, 'programCount'>;
const PROGRAM_COUNT_FIELDS = PLATFORM_COUNT_FIELDS.filter(field => field !== 'programCount') as ProgramCountField[];
type ReferralMarketingSummaryRecord = Record<PlatformCountField, number> & {
  schemaVersion: number;
  summaryEpoch: string;
  approvedCreditTotalsByCurrency: Record<string, number>;
};

type ReferralProgramSummaryRecord = Omit<ReferralMarketingSummaryRecord, 'programCount'> & {
  programId: string;
  status: ProgramStatus;
  countryCodes: string[];
  currency: string;
  inviterCreditMinor: number;
  invitedDiscountMinor: number;
  startsAt: string;
  endsAt: string;
  validatedVisitCount: number;
};

type ReferralReferrerSummaryRecord = {
  schemaVersion: number;
  summaryEpoch: string;
  inviterOwnerType: OwnerType;
  inviterId: string;
  attributionCount: number;
  rewardCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  flaggedPendingCount: number;
  approvedCreditTotalsByCurrency: Record<string, number>;
};

function hasActiveSummaryMarker(value: RecordValue | undefined): boolean {
  return value?.summaryVersion === REFERRAL_CANONICAL_SUMMARY_VERSION
    && value.summaryEpoch === REFERRAL_SUMMARY_EPOCH;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeCurrencyAmountMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as RecordValue);
  if (entries.length > SUPPORTED_REFERRAL_CURRENCIES.size) return null;
  if (entries.some(([currency, amount]) => !SUPPORTED_REFERRAL_CURRENCIES.has(currency) || !nonNegativeSafeInteger(amount))) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function safeMarketingSummary(value: RecordValue | undefined): ReferralMarketingSummaryRecord | null {
  if (!value || value.schemaVersion !== REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
    || value.summaryEpoch !== REFERRAL_SUMMARY_EPOCH
    || PLATFORM_COUNT_FIELDS.some(field => !nonNegativeSafeInteger(value[field]))) return null;
  const approvedCreditTotalsByCurrency = safeCurrencyAmountMap(value.approvedCreditTotalsByCurrency);
  if (!approvedCreditTotalsByCurrency) return null;
  return {
    schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    ...Object.fromEntries(PLATFORM_COUNT_FIELDS.map(field => [field, value[field] as number])) as Record<PlatformCountField, number>,
    approvedCreditTotalsByCurrency,
  };
}

function newProgramSummary(programId: string, input: ReturnType<typeof activeProgramInput>): ReferralProgramSummaryRecord {
  return {
    schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    programId,
    status: input.status,
    countryCodes: [...input.countryCodes],
    currency: input.currency,
    inviterCreditMinor: input.inviterCreditMinor,
    invitedDiscountMinor: input.invitedDiscountMinor,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    codeCount: 0,
    attributionCount: 0,
    rewardCount: 0,
    pendingRewardCount: 0,
    approvedRewardCount: 0,
    rejectedRewardCount: 0,
    cancelledRewardCount: 0,
    flaggedPendingRewardCount: 0,
    validatedVisitCount: 0,
    approvedCreditTotalsByCurrency: {},
  };
}

function safeProgramSummary(value: RecordValue | undefined, programId: string): ReferralProgramSummaryRecord | null {
  const approvedCreditTotalsByCurrency = safeCurrencyAmountMap(value?.approvedCreditTotalsByCurrency);
  if (!value || value.schemaVersion !== REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
    || value.summaryEpoch !== REFERRAL_SUMMARY_EPOCH
    || PROGRAM_COUNT_FIELDS.some(field => !nonNegativeSafeInteger(value[field]))
    || !approvedCreditTotalsByCurrency || value.programId !== programId
    || (value.status !== 'draft' && value.status !== 'active' && value.status !== 'paused' && value.status !== 'archived')
    || !Array.isArray(value.countryCodes) || !value.countryCodes.every(country => typeof country === 'string' && COUNTRY_PATTERN.test(country))
    || typeof value.currency !== 'string' || !SUPPORTED_REFERRAL_CURRENCIES.has(value.currency)
    || !nonNegativeSafeInteger(value.inviterCreditMinor) || !nonNegativeSafeInteger(value.invitedDiscountMinor)
    || timestampMs(value.startsAt) === undefined || timestampMs(value.endsAt) === undefined
    || !nonNegativeSafeInteger(value.validatedVisitCount)) return null;
  return {
    schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    ...Object.fromEntries(PROGRAM_COUNT_FIELDS.map(field => [field, value[field] as number])) as Record<ProgramCountField, number>,
    approvedCreditTotalsByCurrency,
    programId,
    status: value.status,
    countryCodes: [...value.countryCodes] as string[],
    currency: value.currency,
    inviterCreditMinor: value.inviterCreditMinor,
    invitedDiscountMinor: value.invitedDiscountMinor,
    startsAt: timestampIso(value.startsAt) as string,
    endsAt: timestampIso(value.endsAt) as string,
    validatedVisitCount: value.validatedVisitCount,
  };
}

function newReferrerSummary(inviterOwnerType: OwnerType, inviterId: string): ReferralReferrerSummaryRecord {
  return {
    schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    inviterOwnerType,
    inviterId,
    attributionCount: 0,
    rewardCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    cancelledCount: 0,
    flaggedPendingCount: 0,
    approvedCreditTotalsByCurrency: {},
  };
}

function safeReferrerSummary(
  value: RecordValue | undefined,
  inviterOwnerType: OwnerType,
  inviterId: string,
): ReferralReferrerSummaryRecord | null {
  const fields = ['attributionCount', 'rewardCount', 'pendingCount', 'approvedCount', 'rejectedCount', 'cancelledCount', 'flaggedPendingCount'] as const;
  const totals = safeCurrencyAmountMap(value?.approvedCreditTotalsByCurrency);
  if (!value || value.schemaVersion !== REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
    || value.summaryEpoch !== REFERRAL_SUMMARY_EPOCH || value.inviterOwnerType !== inviterOwnerType
    || value.inviterId !== inviterId || fields.some(field => !nonNegativeSafeInteger(value[field])) || !totals) return null;
  return {
    schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    inviterOwnerType,
    inviterId,
    ...Object.fromEntries(fields.map(field => [field, value[field] as number])) as Pick<ReferralReferrerSummaryRecord, typeof fields[number]>,
    approvedCreditTotalsByCurrency: totals,
  };
}

function adjustCount(target: RecordValue, field: string, delta: number): void {
  const current = target[field];
  if (!nonNegativeSafeInteger(current) || !Number.isSafeInteger(delta) || !Number.isSafeInteger(current + delta) || current + delta < 0) {
    error('failed-precondition', 'Referral summary counter transition is invalid');
  }
  target[field] = current + delta;
}

function adjustCurrencyAmount(totals: Record<string, number>, currency: string, delta: number): void {
  if (!SUPPORTED_REFERRAL_CURRENCIES.has(currency) || !Number.isSafeInteger(delta)) {
    error('failed-precondition', 'Referral summary currency transition is invalid');
  }
  const next = (totals[currency] ?? 0) + delta;
  if (!Number.isSafeInteger(next) || next < 0) error('failed-precondition', 'Referral summary currency transition is invalid');
  totals[currency] = next;
}

async function readMarketingSummary(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
): Promise<{ ref: admin.firestore.DocumentReference; summary: ReferralMarketingSummaryRecord }> {
  const ref = firestore.collection('referralMarketingSummaries').doc('overview');
  const snapshot = await transaction.get(ref);
  const summary = safeMarketingSummary(snapshot.data() as RecordValue | undefined);
  if (!snapshot.exists || !summary) error('failed-precondition', 'Referral marketing projection migration is required');
  return { ref, summary };
}

async function readProgramSummary(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
  programId: string,
): Promise<{ ref: admin.firestore.DocumentReference; summary: ReferralProgramSummaryRecord }> {
  const ref = firestore.collection('referralProgramSummaries').doc(programId);
  const snapshot = await transaction.get(ref);
  const summary = safeProgramSummary(snapshot.data() as RecordValue | undefined, programId);
  if (!snapshot.exists || !summary) error('failed-precondition', 'Referral program projection migration is required');
  return { ref, summary };
}

async function readReferrerSummary(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
  inviterOwnerType: OwnerType,
  inviterId: string,
  createIfMissing: boolean,
): Promise<{ ref: admin.firestore.DocumentReference; summary: ReferralReferrerSummaryRecord } | null> {
  const ref = firestore.collection('referralReferrerSummaries').doc(ownerSummaryId(inviterOwnerType, inviterId));
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists && !createIfMissing) return null;
  const summary = snapshot.exists
    ? safeReferrerSummary(snapshot.data() as RecordValue | undefined, inviterOwnerType, inviterId)
    : newReferrerSummary(inviterOwnerType, inviterId);
  if (!summary) error('failed-precondition', 'Referral referrer projection is invalid');
  return { ref, summary };
}

function writeProjection(
  transaction: admin.firestore.Transaction,
  ref: admin.firestore.DocumentReference,
  summary: RecordValue,
): void {
  transaction.set(ref, { ...summary, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

export async function createReferralProgram(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
  verifiedPlatformAdmin = false,
): Promise<{ programId: string; status: ProgramStatus }> {
  const uid = callerUid(caller);
  await requireSuperAdmin(uid, firestore, verifiedPlatformAdmin);
  const input = activeProgramInput(value, currentTime);
  const programs = firestore.collection('referralPrograms');
  const programRef = input.programId ? programs.doc(input.programId) : programs.doc();
  const activeProgramStateRef = firestore.collection('referralProgramState').doc(ACTIVE_PROGRAM_STATE_ID);
  const auditRef = firestore.collection('auditEvents').doc();
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const programSummaryRef = firestore.collection('referralProgramSummaries').doc(programRef.id);
    const [existing, activeProgramState, marketingProjection, existingProgramSummarySnapshot] = await Promise.all([
      transaction.get(programRef),
      transaction.get(activeProgramStateRef),
      readMarketingSummary(transaction, firestore),
      transaction.get(programSummaryRef),
    ]);
    if (activeProgramState.exists && !hasActiveSummaryMarker(activeProgramState.data() as RecordValue | undefined)) {
      error('failed-precondition', 'Referral program state projection migration is required');
    }
    const activeProgramId = activeProgramState.data()?.programId;
    if (input.status === 'active') {
      if (typeof activeProgramId === 'string' && activeProgramId !== programRef.id) {
        error('failed-precondition', 'Only one referral program may be active');
      }
    }
    if (existing.exists && !hasActiveSummaryMarker(existing.data() as RecordValue | undefined)) {
      error('failed-precondition', 'Referral program projection migration is required');
    }
    if (!existing.exists && existingProgramSummarySnapshot.exists) {
      error('failed-precondition', 'Referral program projection is inconsistent');
    }
    const existingProgramSummary = existing.exists
      ? safeProgramSummary(existingProgramSummarySnapshot.data() as RecordValue | undefined, programRef.id)
      : null;
    if (existing.exists && (!existingProgramSummarySnapshot.exists || !existingProgramSummary)) {
      error('failed-precondition', 'Referral program projection migration is required');
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const activatesEligibilityEvidence = input.status === 'active'
      && (!existing.exists || existing.data()?.status !== 'active');
    const program = {
      status: input.status,
      countryCodes: input.countryCodes,
      currency: input.currency,
      inviterCreditMinor: input.inviterCreditMinor,
      invitedDiscountMinor: input.invitedDiscountMinor,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      updatedBy: uid,
      updatedAt: now,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      ...(existing.exists ? {} : { createdBy: uid, createdAt: now }),
      ...(activatesEligibilityEvidence ? {
        eligibilityEvidenceVersion: REFERRAL_ELIGIBILITY_EVIDENCE_VERSION,
        eligibilityEvidenceNotBeforeAt: currentTime.toISOString(),
      } : {}),
    };
    const programProjection = existingProgramSummary ?? newProgramSummary(programRef.id, input);
    Object.assign(programProjection, {
      status: input.status,
      countryCodes: [...input.countryCodes],
      currency: input.currency,
      inviterCreditMinor: input.inviterCreditMinor,
      invitedDiscountMinor: input.invitedDiscountMinor,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (!existing.exists) adjustCount(marketingProjection.summary as unknown as RecordValue, 'programCount', 1);
    writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
    writeProjection(transaction, programSummaryRef, programProjection as unknown as RecordValue);
    if (existing.exists) transaction.update(programRef, program);
    else transaction.create(programRef, program);
    if (input.status === 'active') {
      transaction.set(activeProgramStateRef, {
        programId: programRef.id, summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
        summaryEpoch: REFERRAL_SUMMARY_EPOCH, updatedAt: now,
      });
    } else if (activeProgramId === programRef.id || existing.data()?.status === 'active') {
      transaction.set(activeProgramStateRef, {
        programId: null, summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
        summaryEpoch: REFERRAL_SUMMARY_EPOCH, updatedAt: now,
      });
    }
    transaction.create(auditRef, {
      action: existing.exists ? 'REFERRAL_PROGRAM_UPDATED' : 'REFERRAL_PROGRAM_CREATED',
      actorUid: uid, programId: programRef.id, status: input.status, createdAt: now,
    });
    transaction.create(referralAuditRef, {
      action: existing.exists ? 'REFERRAL_PROGRAM_UPDATED' : 'REFERRAL_PROGRAM_CREATED',
      actorUid: uid, programId: programRef.id, summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH, createdAt: now,
    });
  });
  return { programId: programRef.id, status: input.status };
}

export async function reserveReferralCode(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ code: string }> {
  const uid = callerUid(caller);
  const input = record(value, ['programId', 'code', 'ownerType', 'brandId'], 'Referral code reservation is invalid');
  const programId = documentId(input.programId, 'programId');
  const code = normalizeReferralCode(input.code);
  const ownerType = input.ownerType;
  if (ownerType !== 'client' && ownerType !== 'freelancer' && ownerType !== 'brand') {
    error('invalid-argument', 'ownerType is invalid');
  }
  const brandId = input.brandId === undefined ? undefined : documentId(input.brandId, 'brandId');
  if ((ownerType === 'brand') !== (brandId !== undefined)) error('invalid-argument', 'brandId is invalid');
  const ownerId = ownerType === 'brand' ? brandId as string : uid;
  const programRef = firestore.collection('referralPrograms').doc(programId);
  const codeRef = firestore.collection('referralCodes').doc(code);
  const membershipRef = ownerType === 'brand'
    ? firestore.collection('memberships').doc(`${ownerId}__principal__${uid}`)
    : undefined;
  const ownerProgramCodeRef = firestore.collection('referralOwnerProgramCodes')
    .doc(ownerProgramCodeId(ownerType as OwnerType, ownerId, programId));
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const reads = await Promise.all([
      transaction.get(programRef),
      transaction.get(codeRef),
      transaction.get(ownerProgramCodeRef),
      ...(membershipRef ? [transaction.get(membershipRef)] : []),
    ]);
    const program = reads[0].data() as RecordValue | undefined;
    if (!validProgram(program, 'FR', currentTime) || !hasActiveSummaryMarker(program)) {
      error('failed-precondition', 'Referral program is not active');
    }
    if (reads[1].exists) error('already-exists', 'Referral code is already reserved');
    if (reads[2].exists) error('already-exists', 'A referral code already exists for this owner and program');
    if (membershipRef) {
      const membership = reads[3].data() as RecordValue | undefined;
      if (
        !membership || membership.userId !== uid || membership.brandId !== ownerId
        || membership.role !== 'principal_admin' || membership.status !== 'active'
      ) error('permission-denied', 'Brand referral codes require a Principal Admin');
    }
    const [marketingProjection, programProjection, ownerProjection] = await Promise.all([
      readMarketingSummary(transaction, firestore),
      readProgramSummary(transaction, firestore, programId),
      readOwnerProjection(transaction, firestore, ownerType as OwnerType, ownerId, true),
    ]);
    adjustCount(marketingProjection.summary as unknown as RecordValue, 'codeCount', 1);
    adjustCount(programProjection.summary as unknown as RecordValue, 'codeCount', 1);
    if (!ownerProjection) error('failed-precondition', 'Referral owner projection is invalid');
    adjustCount(ownerProjection.summary as unknown as RecordValue, 'codeCount', 1);
    ownerProjection.summary.currentCode = { code, programId, status: 'active' };
    writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
    writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
    writeProjection(transaction, ownerProjection.ref, ownerProjection.summary as unknown as RecordValue);
    transaction.create(codeRef, {
      code, programId, ownerType: ownerType as OwnerType, ownerId, status: 'active',
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdBy: uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.create(ownerProgramCodeRef, {
      ownerType, ownerId, programId, code,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_CODE_CREATED', actorUid: uid, programId, code,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { code };
}

export async function createMyReferralCode(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
  codeFactory: () => string = generatedReferralCode,
  verifiedPlatformAdmin = false,
): Promise<{ code: string; ownerType: OwnerType; programId: string; reused: boolean }> {
  const uid = callerUid(caller);
  if (verifiedPlatformAdmin) error('permission-denied', 'Super Admin accounts cannot create referral codes');
  const selectedScope = referralCodeScope(value);
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = normalizeReferralCode(codeFactory());
    const referralAuditRef = firestore.collection('referralAudit').doc();
    const result = await firestore.runTransaction(async transaction => {
      const stateRef = firestore.collection('referralProgramState').doc(ACTIVE_PROGRAM_STATE_ID);
      const userRef = firestore.collection('users').doc(uid);
      const freelancerRef = firestore.collection('freelancerProfiles').doc(uid);
      const [stateSnapshot, userSnapshot, freelancerSnapshot] = await Promise.all([
        transaction.get(stateRef),
        transaction.get(userRef),
        transaction.get(freelancerRef),
      ]);
      let hasActiveMembership = false;
      let hasBrandMembership = false;
      if (selectedScope.type === 'brand') {
        const brandMemberships = firestore.collection('memberships')
          .where('userId', '==', uid).where('brandId', '==', selectedScope.brandId).where('status', '==', 'active');
        const [principalMembership, salonAdminMembership] = await Promise.all([
          transaction.get(brandMemberships.where('role', '==', 'principal_admin').limit(1)),
          transaction.get(brandMemberships.where('role', '==', 'salon_admin').limit(1)),
        ]);
        hasBrandMembership = !principalMembership.empty || !salonAdminMembership.empty;
      } else {
        const membership = await transaction.get(
          firestore.collection('memberships').where('userId', '==', uid).where('status', '==', 'active').limit(1),
        );
        hasActiveMembership = !membership.empty;
      }
      const programId = stateSnapshot.data()?.programId;
      if (!hasActiveSummaryMarker(stateSnapshot.data() as RecordValue | undefined)
        || typeof programId !== 'string' || !DOCUMENT_ID_PATTERN.test(programId)) {
        error('failed-precondition', 'There is no active referral program');
      }
      const programSnapshot = await transaction.get(firestore.collection('referralPrograms').doc(programId));
      if (!validProgram(programSnapshot.data() as RecordValue | undefined, 'FR', currentTime)
        || !hasActiveSummaryMarker(programSnapshot.data() as RecordValue | undefined)) {
        error('failed-precondition', 'There is no active referral program');
      }
      const profile = userSnapshot.data() as RecordValue | undefined;
      if (
        !userSnapshot.exists
        || !hasCanonicalUserIdentity(profile, uid)
        || profile?.platformAdmin === true
        || profile?.role === 'superadmin'
      ) {
        error('permission-denied', 'This account cannot create referral codes');
      }
      let ownerType: OwnerType;
      let ownerId: string;
      if (selectedScope.type === 'client') {
        if (
          !isEligiblePersonalReferralIdentity(profile, uid, ['client'])
          || freelancerSnapshot.exists
          || hasActiveMembership
        ) {
          error('permission-denied', 'Staff accounts cannot create referral codes');
        }
        ownerType = 'client';
        ownerId = uid;
      } else if (selectedScope.type === 'freelancer') {
        if (
          !isEligiblePersonalReferralIdentity(profile, uid, ['client', 'freelancer'])
          || !freelancerSnapshot.exists
          || !hasCanonicalUserIdentity(freelancerSnapshot.data() as RecordValue | undefined, uid)
          || hasActiveMembership
        ) {
          error('permission-denied', 'This account cannot create freelancer referral codes');
        }
        ownerType = 'freelancer';
        ownerId = uid;
      } else {
        if (!hasBrandMembership) error('permission-denied', 'Brand referral code scope is not authorized');
        const brandSnapshot = await transaction.get(firestore.collection('brands').doc(selectedScope.brandId));
        if (!brandSnapshot.exists) error('permission-denied', 'Brand referral code scope is not authorized');
        ownerType = 'brand';
        ownerId = selectedScope.brandId;
      }
      const ownerProgramCodeRef = firestore.collection('referralOwnerProgramCodes')
        .doc(ownerProgramCodeId(ownerType, ownerId, programId));
      const ownerProgramCodeSnapshot = await transaction.get(ownerProgramCodeRef);
      if (ownerProgramCodeSnapshot.exists) {
        const lookup = ownerProgramCodeSnapshot.data() as RecordValue | undefined;
        if (!hasActiveSummaryMarker(lookup) || lookup?.ownerType !== ownerType || lookup.ownerId !== ownerId
          || lookup.programId !== programId || typeof lookup.code !== 'string' || !CODE_PATTERN.test(lookup.code)) {
          error('failed-precondition', 'Referral code projection is invalid');
        }
        const existingCodeSnapshot = await transaction.get(firestore.collection('referralCodes').doc(lookup.code));
        const existingCode = existingCodeSnapshot.data() as RecordValue | undefined;
        if (!existingCodeSnapshot.exists || !hasActiveSummaryMarker(existingCode)
          || existingCode?.code !== lookup.code || existingCode.programId !== programId
          || existingCode.ownerType !== ownerType || existingCode.ownerId !== ownerId || existingCode.status !== 'active') {
          error('failed-precondition', 'Referral code projection is invalid');
        }
        return { code: lookup.code, ownerType, programId, reused: true };
      }
      const codeRef = firestore.collection('referralCodes').doc(candidate);
      if ((await transaction.get(codeRef)).exists) return null;
      const [marketingProjection, programProjection, ownerProjection] = await Promise.all([
        readMarketingSummary(transaction, firestore),
        readProgramSummary(transaction, firestore, programId),
        readOwnerProjection(transaction, firestore, ownerType, ownerId, true),
      ]);
      adjustCount(marketingProjection.summary as unknown as RecordValue, 'codeCount', 1);
      adjustCount(programProjection.summary as unknown as RecordValue, 'codeCount', 1);
      if (!ownerProjection) error('failed-precondition', 'Referral owner projection is invalid');
      adjustCount(ownerProjection.summary as unknown as RecordValue, 'codeCount', 1);
      ownerProjection.summary.currentCode = { code: candidate, programId, status: 'active' };
      writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
      writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
      writeProjection(transaction, ownerProjection.ref, ownerProjection.summary as unknown as RecordValue);
      transaction.create(codeRef, {
        code: candidate,
        programId,
        ownerType,
        ownerId,
        status: 'active',
        summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
        summaryEpoch: REFERRAL_SUMMARY_EPOCH,
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(ownerProgramCodeRef, {
        ownerType, ownerId, programId, code: candidate,
        summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(referralAuditRef, {
        action: 'REFERRAL_CODE_CREATED', actorUid: uid, programId, code: candidate,
        ownerId, ownerType, summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { code: candidate, ownerType, programId, reused: false };
    });
    if (result) return result;
  }
  error('resource-exhausted', 'Unable to reserve a unique referral code');
}

export async function attributeReferral(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
  verifiedPlatformAdmin = false,
): Promise<{ attributed: true; programId: string }> {
  const uid = callerUid(caller);
  if (verifiedPlatformAdmin) error('permission-denied', 'Referral attribution is available only to client accounts');
  const input = record(value, ['code', 'countryCode'], 'Referral attribution is invalid');
  const code = normalizeReferralCode(input.code);
  const countryCode = input.countryCode === undefined ? 'FR' : isoCountry(input.countryCode, 'countryCode');
  const attributionRef = firestore.collection('referralAttributions').doc(uid);
  const codeRef = firestore.collection('referralCodes').doc(code);
  const userRef = firestore.collection('users').doc(uid);
  const freelancerRef = firestore.collection('freelancerProfiles').doc(uid);
  const memberships = firestore.collection('memberships').where('userId', '==', uid).where('status', '==', 'active').limit(1);
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const [existing, codeSnapshot, userSnapshot, freelancerSnapshot, membershipSnapshots] = await Promise.all([
      transaction.get(attributionRef),
      transaction.get(codeRef),
      transaction.get(userRef),
      transaction.get(freelancerRef),
      transaction.get(memberships),
    ]);
    if (existing.exists) error('already-exists', 'Referral attribution is immutable');
    const referralCode = codeSnapshot.data() as RecordValue | undefined;
    if (!codeSnapshot.exists || !referralCode || referralCode.status !== 'active' || !hasActiveSummaryMarker(referralCode)) {
      error('not-found', 'Referral code is unavailable');
    }
    const inviterOwnerType = ownerType(referralCode.ownerType);
    if (
      !inviterOwnerType || typeof referralCode.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.ownerId)
    ) error('failed-precondition', 'Referral code is invalid');
    if (samePrincipal(referralCode.ownerId, inviterOwnerType, uid, 'client')) {
      error('permission-denied', 'You cannot use your own referral code');
    }
    if (typeof referralCode.programId !== 'string') error('failed-precondition', 'Referral code is invalid');
    const profile = userSnapshot.data() as RecordValue | undefined;
    if (
      !userSnapshot.exists
      || !isEligiblePersonalReferralIdentity(profile, uid, ['client'])
      || freelancerSnapshot.exists
      || !membershipSnapshots.empty
    ) error('permission-denied', 'Referral attribution is available only to client accounts');
    const programRef = firestore.collection('referralPrograms').doc(referralCode.programId);
    const existingBookings = firestore.collection('bookings').where('clientId', '==', uid).limit(1);
    const [programSnapshot, bookings] = await Promise.all([transaction.get(programRef), transaction.get(existingBookings)]);
    if (!validProgram(programSnapshot.data() as RecordValue | undefined, countryCode, currentTime)
      || !hasActiveSummaryMarker(programSnapshot.data() as RecordValue | undefined)) {
      error('failed-precondition', 'Referral program is not available');
    }
    if (!bookings.empty) error('failed-precondition', 'Referral attribution is available only to new clients');
    const [marketingProjection, programProjection, inviterProjection, referrerProjection] = await Promise.all([
      readMarketingSummary(transaction, firestore),
      readProgramSummary(transaction, firestore, referralCode.programId),
      readOwnerProjection(transaction, firestore, inviterOwnerType, referralCode.ownerId, false),
      readReferrerSummary(transaction, firestore, inviterOwnerType, referralCode.ownerId, true),
    ]);
    if (!inviterProjection || !referrerProjection) error('failed-precondition', 'Referral owner projection migration is required');
    adjustCount(marketingProjection.summary as unknown as RecordValue, 'attributionCount', 1);
    adjustCount(programProjection.summary as unknown as RecordValue, 'attributionCount', 1);
    adjustCount(inviterProjection.summary as unknown as RecordValue, 'attributionCount', 1);
    adjustCount(referrerProjection.summary as unknown as RecordValue, 'attributionCount', 1);
    writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
    writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
    writeProjection(transaction, inviterProjection.ref, inviterProjection.summary as unknown as RecordValue);
    writeProjection(transaction, referrerProjection.ref, referrerProjection.summary as unknown as RecordValue);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(attributionRef, {
      code,
      programId: referralCode.programId,
      inviterId: referralCode.ownerId,
      inviterOwnerType,
      countryCode,
      expiresAt: new Date(currentTime.getTime() + 30 * DAY_MS).toISOString(),
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      recordedAt: now,
    });
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_ATTRIBUTED', actorUid: uid, programId: referralCode.programId, code,
      inviterId: referralCode.ownerId, inviterOwnerType,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH, createdAt: now,
    });
  });
  const codeSnapshot = await codeRef.get();
  return { attributed: true, programId: String(codeSnapshot.data()?.programId) };
}

export async function processReferralBookingCompletion(
  bookingId: string,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
  completionEvidenceValue?: unknown,
): Promise<{ created: boolean }> {
  if (!DOCUMENT_ID_PATTERN.test(bookingId)) error('invalid-argument', 'bookingId is invalid');
  const completionEvidence = referralCompletionEvidence(completionEvidenceValue);
  if (!completionEvidence) return { created: false };
  const bookingRef = firestore.collection('bookings').doc(bookingId);
  const eligibilityEvidenceRef = firestore.collection('referralBookingEvidence').doc(bookingId);
  const referralAuditRef = firestore.collection('referralAudit').doc();
  const created = await firestore.runTransaction(async transaction => {
    const bookingSnapshot = await transaction.get(bookingRef);
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !isPositivePaidBooking(booking)) return false;
    if (typeof booking.clientId !== 'string' || !DOCUMENT_ID_PATTERN.test(booking.clientId)) return false;
    const attributionRef = firestore.collection('referralAttributions').doc(booking.clientId);
    const [attributionSnapshot, completedBookings] = await Promise.all([
      transaction.get(attributionRef),
      transaction.get(firestore.collection('bookings')
        .where('clientId', '==', booking.clientId).where('status', '==', 'completed')
        .where('paymentStatus', '==', 'paid').where('isTest', '==', false).where('pricePaidMinor', '>', 0)
        .orderBy('completedAt', 'asc').orderBy(DOCUMENT_ID_FIELD_PATH, 'asc').limit(1)),
    ]);
    const attribution = attributionSnapshot.data() as RecordValue | undefined;
    if (!attributionSnapshot.exists || !attribution || !hasActiveSummaryMarker(attribution)
      || typeof attribution.programId !== 'string' || typeof attribution.code !== 'string') return false;
    // Attribution expiry is evaluated at the immutable completion event, not at
    // delayed trigger handling time.
    if (
      timestampMs(attribution.expiresAt) === undefined
      || (timestampMs(attribution.expiresAt) as number) < completionEvidence.updateTimeMs
    ) return false;
    const earliestBooking = earliestPositivePaidCompletion(completedBookings.docs as Array<{ id: string; data(): RecordValue }>);
    const completedAtMs = positivePaidCompletionAt(booking);
    if (!earliestBooking || completedAtMs === undefined || earliestBooking.id !== bookingId) return false;
    const programRef = firestore.collection('referralPrograms').doc(attribution.programId);
    const codeRef = firestore.collection('referralCodes').doc(attribution.code);
    const rewardRef = firestore.collection('referralRewards').doc(`${attribution.programId}__${booking.clientId}`);
    const [programSnapshot, codeSnapshot, rewardSnapshot, eligibilityEvidenceSnapshot] = await Promise.all([
      transaction.get(programRef), transaction.get(codeRef), transaction.get(rewardRef), transaction.get(eligibilityEvidenceRef),
    ]);
    if (rewardSnapshot.exists) return false;
    const program = programSnapshot.data() as RecordValue | undefined;
    const code = codeSnapshot.data() as RecordValue | undefined;
    const countryCode = typeof attribution.countryCode === 'string' ? attribution.countryCode : 'FR';
    // The trigger's immutable update time, rather than delayed handler wall time,
    // decides whether this completion occurred while the program was available.
    if (!validProgram(program, countryCode, new Date(completionEvidence.updateTimeMs))
      || !hasActiveSummaryMarker(program) || !hasActiveSummaryMarker(code)) return false;
    const programEvidence = programEligibilityEvidence(program);
    if (!programEvidence || !isTrustedCompletionEvidence(completionEvidence, completedAtMs, programEvidence)) return false;
    const inviterOwnerType = ownerType(code?.ownerType);
    if (
      !codeSnapshot.exists || !code || code.code !== attribution.code || code.status !== 'active' || code.programId !== attribution.programId
      || code.ownerId !== attribution.inviterId || typeof attribution.inviterId !== 'string'
      || !inviterOwnerType || samePrincipal(code.ownerId, inviterOwnerType, booking.clientId, 'client')
      || (attribution.inviterOwnerType !== undefined && attribution.inviterOwnerType !== inviterOwnerType)
    ) return false;
    const qualification: TrustedReferralQualification = {
      rewardId: rewardRef.id,
      programId: attribution.programId,
      bookingId,
      code: attribution.code,
      inviterId: attribution.inviterId,
      inviterOwnerId: code.ownerId as string,
      inviterOwnerType,
      invitedUserId: booking.clientId,
      invitedOwnerId: booking.clientId,
      invitedOwnerType: 'client',
      currency: (program as RecordValue).currency as string,
      inviterCreditMinor: (program as RecordValue).inviterCreditMinor as number,
      invitedDiscountMinor: (program as RecordValue).invitedDiscountMinor as number,
      eligibleCompletedAtMs: completedAtMs,
      eligibilityEvidenceVersion: completionEvidence.version,
      eligibilityEvidenceEventId: completionEvidence.eventId,
      eligibilityEvidenceUpdateTimeMs: completionEvidence.updateTimeMs,
      eligibilityProgramNotBeforeAtMs: programEvidence.notBeforeAtMs,
    };
    const existingEligibilityEvidence = eligibilityEvidenceSnapshot.data() as RecordValue | undefined;
    if (eligibilityEvidenceSnapshot.exists && (
      !hasActiveSummaryMarker(existingEligibilityEvidence)
      || !qualificationMatchesRecord(existingEligibilityEvidence, qualification)
    )) return false;
    const [marketingProjection, programProjection, referrerProjection, inviterProjection, inviteeProjection] = await Promise.all([
      readMarketingSummary(transaction, firestore),
      readProgramSummary(transaction, firestore, qualification.programId),
      readReferrerSummary(transaction, firestore, inviterOwnerType, qualification.inviterId, false),
      readOwnerProjection(transaction, firestore, inviterOwnerType, qualification.inviterId, false),
      readOwnerProjection(transaction, firestore, 'client', qualification.invitedUserId, true),
    ]);
    if (!referrerProjection || !inviterProjection || !inviteeProjection) return false;
    adjustCount(marketingProjection.summary as unknown as RecordValue, 'rewardCount', 1);
    adjustCount(marketingProjection.summary as unknown as RecordValue, 'pendingRewardCount', 1);
    adjustCount(programProjection.summary as unknown as RecordValue, 'rewardCount', 1);
    adjustCount(programProjection.summary as unknown as RecordValue, 'pendingRewardCount', 1);
    adjustCount(referrerProjection.summary as unknown as RecordValue, 'rewardCount', 1);
    adjustCount(referrerProjection.summary as unknown as RecordValue, 'pendingCount', 1);
    adjustOwnerSummaryRole(inviterProjection.summary, 'inviter', 'pending', qualification.inviterCreditMinor, qualification.currency, 1);
    adjustOwnerSummaryRole(inviteeProjection.summary, 'invitee', 'pending', qualification.invitedDiscountMinor, qualification.currency, 1);
    writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
    writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
    writeProjection(transaction, referrerProjection.ref, referrerProjection.summary as unknown as RecordValue);
    writeProjection(transaction, inviterProjection.ref, inviterProjection.summary as unknown as RecordValue);
    writeProjection(transaction, inviteeProjection.ref, inviteeProjection.summary as unknown as RecordValue);
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (attribution.inviterOwnerType === undefined) transaction.update(attributionRef, { inviterOwnerType });
    if (!eligibilityEvidenceSnapshot.exists) {
      transaction.create(eligibilityEvidenceRef, {
        ...qualification,
        summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
        summaryEpoch: REFERRAL_SUMMARY_EPOCH,
        createdAt: now,
      });
    }
    transaction.create(rewardRef, {
      ...qualification,
      status: 'pending' as RewardStatus,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdAt: now,
      updatedAt: now,
    });
    await Promise.all([
      writeOwnerHistoryProjection(transaction, firestore, inviterOwnerType, attribution.inviterId as string, 'inviter', rewardRef.id),
      writeOwnerHistoryProjection(transaction, firestore, 'client', booking.clientId as string, 'invitee', rewardRef.id),
    ]);
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_REWARD_PENDING', programId: attribution.programId, rewardId: rewardRef.id,
      code: attribution.code, inviterId: attribution.inviterId, inviterOwnerType,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH, createdAt: now,
    });
    return true;
  });
  return { created };
}

export async function reviewReferralReward(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  verifiedPlatformAdmin = false,
): Promise<{ rewardId: string; status: Exclude<RewardStatus, 'pending'> }> {
  const uid = callerUid(caller);
  await requireSuperAdmin(uid, firestore, verifiedPlatformAdmin);
  const input = record(value, ['rewardId', 'decision', 'reason'], 'Referral reward review is invalid');
  const rewardId = documentId(input.rewardId, 'rewardId');
  if (input.decision !== 'approve' && input.decision !== 'reject' && input.decision !== 'cancel') {
    error('invalid-argument', 'decision is invalid');
  }
  if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.trim() === '' || input.reason.length > 500)) {
    error('invalid-argument', 'reason is invalid');
  }
  if (input.decision === 'reject' && input.reason === undefined) error('invalid-argument', 'reason is required when rejecting');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : undefined;
  const status = input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'cancelled';
  const rewardRef = firestore.collection('referralRewards').doc(rewardId);
  const auditRef = firestore.collection('auditEvents').doc();
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const rewardSnapshot = await transaction.get(rewardRef);
    const reward = rewardSnapshot.data() as RecordValue | undefined;
    if (!rewardSnapshot.exists || !reward) error('not-found', 'Referral reward not found');
    if (reward.status !== 'pending') error('failed-precondition', 'Referral reward is no longer pending review');
    if ((reward.fraudFlag as RecordValue | undefined)?.status === 'flagged' && status === 'approved') {
      error('failed-precondition', 'Flagged referral rewards must be cleared before approval');
    }
    let approvedReward: {
      programId: string; bookingId: string; code: string; inviterId: string; invitedUserId: string;
      inviterOwnerType: OwnerType; currency: string; inviterCreditMinor: number; invitedDiscountMinor: number;
    } | null = null;
    if (status === 'approved') {
      if (!hasActiveSummaryMarker(reward)) {
        error('failed-precondition', 'Referral reward projection migration is required');
      }
      if (
        typeof reward.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(reward.programId)
        || typeof reward.bookingId !== 'string' || !DOCUMENT_ID_PATTERN.test(reward.bookingId)
        || typeof reward.code !== 'string' || !CODE_PATTERN.test(reward.code)
        || typeof reward.inviterId !== 'string' || !DOCUMENT_ID_PATTERN.test(reward.inviterId)
        || typeof reward.invitedUserId !== 'string' || !DOCUMENT_ID_PATTERN.test(reward.invitedUserId)
        || typeof reward.currency !== 'string' || !CURRENCY_PATTERN.test(reward.currency)
        || !Number.isSafeInteger(reward.inviterCreditMinor) || (reward.inviterCreditMinor as number) < 0
        || !Number.isSafeInteger(reward.invitedDiscountMinor) || (reward.invitedDiscountMinor as number) < 0
      ) error('failed-precondition', 'Referral reward is invalid');
      if (rewardId !== `${reward.programId}__${reward.invitedUserId}`) {
        error('failed-precondition', 'Referral reward is invalid');
      }
      // These fields select trusted source documents only. Credit terms are never
      // taken from the mutable pending reward document.
      const linkage = {
        programId: reward.programId as string,
        bookingId: reward.bookingId as string,
        code: reward.code as string,
        invitedUserId: reward.invitedUserId as string,
      };
      const bookingRef = firestore.collection('bookings').doc(linkage.bookingId);
      const eligibilityEvidenceRef = firestore.collection('referralBookingEvidence').doc(linkage.bookingId);
      const attributionRef = firestore.collection('referralAttributions').doc(linkage.invitedUserId);
      const codeRef = firestore.collection('referralCodes').doc(linkage.code);
      const programRef = firestore.collection('referralPrograms').doc(linkage.programId);
      const [bookingSnapshot, eligibilityEvidenceSnapshot, attributionSnapshot, codeSnapshot, programSnapshot, clientBookings] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(eligibilityEvidenceRef),
        transaction.get(attributionRef),
        transaction.get(codeRef),
        transaction.get(programRef),
        transaction.get(firestore.collection('bookings')
          .where('clientId', '==', linkage.invitedUserId).where('status', '==', 'completed')
          .where('paymentStatus', '==', 'paid').where('isTest', '==', false).where('pricePaidMinor', '>', 0)
          .orderBy('completedAt', 'asc').orderBy(DOCUMENT_ID_FIELD_PATH, 'asc').limit(1)),
      ]);
      const booking = bookingSnapshot.data() as RecordValue | undefined;
      const attribution = attributionSnapshot.data() as RecordValue | undefined;
      const code = codeSnapshot.data() as RecordValue | undefined;
      const program = programSnapshot.data() as RecordValue | undefined;
      const eligibilityEvidence = eligibilityEvidenceSnapshot.data() as RecordValue | undefined;
      const earliestBooking = earliestPositivePaidCompletion(clientBookings.docs as Array<{ id: string; data(): RecordValue }>);
      const completedAtMs = positivePaidCompletionAt(booking);
      const programEvidence = programEligibilityEvidence(program);
      const qualification = trustedQualificationFromEvidence(eligibilityEvidence);
      const rewardCompletionEvidence = qualification ? referralCompletionEvidence({
        version: qualification.eligibilityEvidenceVersion,
        eventId: qualification.eligibilityEvidenceEventId,
        updateTimeMs: qualification.eligibilityEvidenceUpdateTimeMs,
      }) : null;
      const inviterOwnerType = ownerType(code?.ownerType);
      const countryCode = typeof attribution?.countryCode === 'string' ? attribution.countryCode : 'FR';
      if (
        !bookingSnapshot.exists || !isPositivePaidBooking(booking)
        || booking.clientId !== linkage.invitedUserId
        || !earliestBooking || completedAtMs === undefined || earliestBooking.id !== linkage.bookingId
        || !qualification || qualification.rewardId !== rewardId
        || qualification.programId !== linkage.programId || qualification.bookingId !== linkage.bookingId
        || qualification.code !== linkage.code || qualification.invitedUserId !== linkage.invitedUserId
        || qualification.inviterOwnerId !== qualification.inviterId
        || qualification.invitedOwnerId !== qualification.invitedUserId
        || qualification.eligibleCompletedAtMs !== completedAtMs
        || !isTrustedCompletionEvidence(rewardCompletionEvidence, completedAtMs, programEvidence)
        || !eligibilityEvidenceSnapshot.exists || !eligibilityEvidence || !hasActiveSummaryMarker(eligibilityEvidence)
        || !qualificationMatchesRecord(eligibilityEvidence, qualification)
        || !qualificationMatchesRecord(reward, qualification)
        || !attributionSnapshot.exists || !attribution || !hasActiveSummaryMarker(attribution)
        || attribution.programId !== qualification.programId
        || attribution.code !== qualification.code || attribution.inviterId !== qualification.inviterId
        || timestampMs(attribution.expiresAt) === undefined
        || (timestampMs(attribution.expiresAt) as number) < qualification.eligibilityEvidenceUpdateTimeMs
        || (attribution.inviterOwnerType !== undefined && attribution.inviterOwnerType !== inviterOwnerType)
        || !programSnapshot.exists || !program || !hasActiveSummaryMarker(program)
        || !validProgram(program, countryCode, new Date(qualification.eligibilityEvidenceUpdateTimeMs))
        || program.currency !== qualification.currency
        || program.inviterCreditMinor !== qualification.inviterCreditMinor
        || program.invitedDiscountMinor !== qualification.invitedDiscountMinor
        || programEvidence?.notBeforeAtMs !== qualification.eligibilityProgramNotBeforeAtMs
        || !codeSnapshot.exists || !code || !hasActiveSummaryMarker(code)
        || code.code !== qualification.code || code.status !== 'active' || code.programId !== qualification.programId
        || code.ownerId !== qualification.inviterId || inviterOwnerType !== qualification.inviterOwnerType
        || samePrincipal(qualification.inviterId, qualification.inviterOwnerType, qualification.invitedUserId, 'client')
      ) error('failed-precondition', 'Referral reward eligibility is no longer valid');
      approvedReward = {
        programId: qualification.programId,
        bookingId: qualification.bookingId,
        code: qualification.code,
        inviterId: qualification.inviterId,
        invitedUserId: qualification.invitedUserId,
        inviterOwnerType: qualification.inviterOwnerType,
        currency: qualification.currency,
        inviterCreditMinor: qualification.inviterCreditMinor,
        invitedDiscountMinor: qualification.invitedDiscountMinor,
      };
      }
    const summaryQualification = trustedQualificationFromEvidence(reward);
    const canMoveExistingSummary = hasActiveSummaryMarker(reward)
      && summaryQualification !== null && canonicalReferralRewardForOverview(rewardId, reward);
    const projectionQualification = approvedReward ? summaryQualification : canMoveExistingSummary ? summaryQualification : null;
    if (approvedReward && !projectionQualification) {
      error('failed-precondition', 'Referral reward projection migration is required');
    }
    if (projectionQualification) {
      const [marketingProjection, programProjection, referrerProjection, inviterProjection, inviteeProjection] = await Promise.all([
        readMarketingSummary(transaction, firestore),
        readProgramSummary(transaction, firestore, projectionQualification.programId),
        readReferrerSummary(transaction, firestore, projectionQualification.inviterOwnerType, projectionQualification.inviterId, false),
        readOwnerProjection(transaction, firestore, projectionQualification.inviterOwnerType, projectionQualification.inviterId, false),
        readOwnerProjection(transaction, firestore, 'client', projectionQualification.invitedUserId, false),
      ]);
      if (!referrerProjection || !inviterProjection || !inviteeProjection) {
        error('failed-precondition', 'Referral reward projection is invalid');
      }
      const targetCountField = status === 'approved' ? 'approvedRewardCount'
        : status === 'rejected' ? 'rejectedRewardCount' : 'cancelledRewardCount';
      adjustCount(marketingProjection.summary as unknown as RecordValue, 'pendingRewardCount', -1);
      adjustCount(marketingProjection.summary as unknown as RecordValue, targetCountField, 1);
      adjustCount(programProjection.summary as unknown as RecordValue, 'pendingRewardCount', -1);
      adjustCount(programProjection.summary as unknown as RecordValue, targetCountField, 1);
      adjustCount(referrerProjection.summary as unknown as RecordValue, 'pendingCount', -1);
      adjustCount(referrerProjection.summary as unknown as RecordValue, `${status}Count`, 1);
      adjustOwnerSummaryRole(inviterProjection.summary, 'inviter', 'pending', projectionQualification.inviterCreditMinor, projectionQualification.currency, -1);
      adjustOwnerSummaryRole(inviteeProjection.summary, 'invitee', 'pending', projectionQualification.invitedDiscountMinor, projectionQualification.currency, -1);
      adjustOwnerSummaryRole(inviterProjection.summary, 'inviter', status, projectionQualification.inviterCreditMinor, projectionQualification.currency, 1);
      adjustOwnerSummaryRole(inviteeProjection.summary, 'invitee', status, projectionQualification.invitedDiscountMinor, projectionQualification.currency, 1);
      if (status === 'approved') {
        adjustCurrencyAmount(
          marketingProjection.summary.approvedCreditTotalsByCurrency,
          projectionQualification.currency,
          projectionQualification.inviterCreditMinor + projectionQualification.invitedDiscountMinor,
        );
        adjustCurrencyAmount(
          programProjection.summary.approvedCreditTotalsByCurrency,
          projectionQualification.currency,
          projectionQualification.inviterCreditMinor + projectionQualification.invitedDiscountMinor,
        );
        adjustCurrencyAmount(
          referrerProjection.summary.approvedCreditTotalsByCurrency,
          projectionQualification.currency,
          projectionQualification.inviterCreditMinor,
        );
      }
      if ((reward.fraudFlag as RecordValue | undefined)?.status === 'flagged') {
        adjustCount(marketingProjection.summary as unknown as RecordValue, 'flaggedPendingRewardCount', -1);
        adjustCount(programProjection.summary as unknown as RecordValue, 'flaggedPendingRewardCount', -1);
        adjustCount(referrerProjection.summary as unknown as RecordValue, 'flaggedPendingCount', -1);
        adjustCount(inviterProjection.summary.inviter, 'flaggedPendingCount', -1);
        adjustCount(inviteeProjection.summary.invitee, 'flaggedPendingCount', -1);
      }
      writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
      writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
      writeProjection(transaction, referrerProjection.ref, referrerProjection.summary as unknown as RecordValue);
      writeProjection(transaction, inviterProjection.ref, inviterProjection.summary as unknown as RecordValue);
      writeProjection(transaction, inviteeProjection.ref, inviteeProjection.summary as unknown as RecordValue);
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(rewardRef, {
      status, reviewedBy: uid, reviewedAt: now, updatedAt: now,
      ...(approvedReward ? {
        inviterOwnerId: approvedReward.inviterId,
        inviterOwnerType: approvedReward.inviterOwnerType,
        invitedOwnerId: approvedReward.invitedUserId,
        invitedOwnerType: 'client',
      } : {}),
      ...(reason ? { reviewReason: reason } : {}),
    });
    if (approvedReward) {
      const inviterLedger = firestore.collection('creditLedgers').doc(`${rewardId}__inviter`);
      const invitedLedger = firestore.collection('creditLedgers').doc(`${rewardId}__invited`);
      transaction.create(inviterLedger, {
        rewardId, ownerId: approvedReward.inviterId, ownerType: approvedReward.inviterOwnerType, amountMinor: approvedReward.inviterCreditMinor,
        currency: approvedReward.currency, kind: 'referral_inviter_credit', status: 'approved', createdAt: now,
      });
      transaction.create(invitedLedger, {
        rewardId, ownerId: approvedReward.invitedUserId, ownerType: 'client', amountMinor: approvedReward.invitedDiscountMinor,
        currency: approvedReward.currency, kind: 'referral_invited_discount', status: 'approved', createdAt: now,
      });
    }
    transaction.create(auditRef, {
      action: `REFERRAL_REWARD_${status.toUpperCase()}`, actorUid: uid, rewardId, createdAt: now,
      ...(typeof reward.programId === 'string' ? { programId: reward.programId } : {}),
    });
    transaction.create(referralAuditRef, {
      action: `REFERRAL_REWARD_${status.toUpperCase()}`, actorUid: uid, rewardId,
      ...(typeof reward.programId === 'string' ? { programId: reward.programId } : {}),
      ...(typeof reward.code === 'string' && CODE_PATTERN.test(reward.code) ? { code: reward.code } : {}),
      ...(reason ? { reason } : {}),
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdAt: now,
    });
  });
  return { rewardId, status };
}

export async function setReferralRewardFlag(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  verifiedPlatformAdmin = false,
): Promise<{ rewardId: string; flagged: boolean }> {
  const uid = callerUid(caller);
  await requireSuperAdmin(uid, firestore, verifiedPlatformAdmin);
  const input = referralRewardFlagInput(value);
  const rewardRef = firestore.collection('referralRewards').doc(input.rewardId);
  const auditRef = firestore.collection('auditEvents').doc();
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const rewardSnapshot = await transaction.get(rewardRef);
    const reward = rewardSnapshot.data() as RecordValue | undefined;
    if (!rewardSnapshot.exists || !reward) error('not-found', 'Referral reward not found');
    if (reward.status !== 'pending') error('failed-precondition', 'Only pending referral rewards can be flagged');
    const summaryQualification = trustedQualificationFromEvidence(reward);
    const canUpdateSummary = hasActiveSummaryMarker(reward)
      && summaryQualification !== null && canonicalReferralRewardForOverview(input.rewardId, reward);
    const wasFlagged = (reward.fraudFlag as RecordValue | undefined)?.status === 'flagged';
    if (canUpdateSummary && summaryQualification && wasFlagged !== input.flagged) {
      const [marketingProjection, programProjection, referrerProjection, inviterProjection, inviteeProjection] = await Promise.all([
        readMarketingSummary(transaction, firestore),
        readProgramSummary(transaction, firestore, summaryQualification.programId),
        readReferrerSummary(transaction, firestore, summaryQualification.inviterOwnerType, summaryQualification.inviterId, false),
        readOwnerProjection(transaction, firestore, summaryQualification.inviterOwnerType, summaryQualification.inviterId, false),
        readOwnerProjection(transaction, firestore, 'client', summaryQualification.invitedUserId, false),
      ]);
      if (!referrerProjection || !inviterProjection || !inviteeProjection) {
        error('failed-precondition', 'Referral reward projection is invalid');
      }
      const delta = input.flagged ? 1 : -1;
      adjustCount(marketingProjection.summary as unknown as RecordValue, 'flaggedPendingRewardCount', delta);
      adjustCount(programProjection.summary as unknown as RecordValue, 'flaggedPendingRewardCount', delta);
      adjustCount(referrerProjection.summary as unknown as RecordValue, 'flaggedPendingCount', delta);
      adjustCount(inviterProjection.summary.inviter, 'flaggedPendingCount', delta);
      adjustCount(inviteeProjection.summary.invitee, 'flaggedPendingCount', delta);
      writeProjection(transaction, marketingProjection.ref, marketingProjection.summary as unknown as RecordValue);
      writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
      writeProjection(transaction, referrerProjection.ref, referrerProjection.summary as unknown as RecordValue);
      writeProjection(transaction, inviterProjection.ref, inviterProjection.summary as unknown as RecordValue);
      writeProjection(transaction, inviteeProjection.ref, inviteeProjection.summary as unknown as RecordValue);
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(rewardRef, {
      fraudFlag: {
        status: input.flagged ? 'flagged' : 'cleared',
        reason: input.reason,
        reviewedBy: uid,
        reviewedAt: now,
      },
      updatedAt: now,
    });
    transaction.create(auditRef, {
      action: input.flagged ? 'REFERRAL_REWARD_FLAGGED' : 'REFERRAL_REWARD_FLAG_CLEARED',
      actorUid: uid,
      rewardId: input.rewardId,
      ...(typeof reward.programId === 'string' ? { programId: reward.programId } : {}),
      reason: input.reason,
      createdAt: now,
    });
    transaction.create(referralAuditRef, {
      action: input.flagged ? 'REFERRAL_REWARD_FLAGGED' : 'REFERRAL_REWARD_FLAG_CLEARED',
      actorUid: uid,
      rewardId: input.rewardId,
      ...(typeof reward.programId === 'string' ? { programId: reward.programId } : {}),
      ...(typeof reward.code === 'string' && CODE_PATTERN.test(reward.code) ? { code: reward.code } : {}),
      reason: input.reason,
      summaryVersion: REFERRAL_CANONICAL_SUMMARY_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      createdAt: now,
    });
  });
  return { rewardId: input.rewardId, flagged: input.flagged };
}

function hasCanonicalReferralQualificationSources(
  qualification: TrustedReferralQualification,
  booking: RecordValue | undefined,
  eligibilityEvidence: RecordValue | undefined,
  attribution: RecordValue | undefined,
  code: RecordValue | undefined,
  program: RecordValue | undefined,
): boolean {
  const completedAtMs = positivePaidCompletionAt(booking);
  const inviterOwnerType = ownerType(code?.ownerType);
  return isPositivePaidBooking(booking)
    && booking?.clientId === qualification.invitedUserId
    && completedAtMs === qualification.eligibleCompletedAtMs
    && qualificationMatchesRecord(eligibilityEvidence, qualification)
    && hasActiveSummaryMarker(eligibilityEvidence)
    && hasActiveSummaryMarker(attribution)
    && attribution?.programId === qualification.programId
    && attribution.code === qualification.code
    && attribution.inviterId === qualification.inviterId
    && attribution.inviterOwnerType === qualification.inviterOwnerType
    && timestampMs(attribution.expiresAt) !== undefined
    && (timestampMs(attribution.expiresAt) as number) >= qualification.eligibilityEvidenceUpdateTimeMs
    && code?.code === qualification.code
    && hasActiveSummaryMarker(code)
    && code?.programId === qualification.programId
    && code?.ownerId === qualification.inviterId
    && inviterOwnerType === qualification.inviterOwnerType
    && program !== undefined
    && hasActiveSummaryMarker(program)
    // The private evidence preserves historical terms. A subsequent program edit
    // must not erase an already issued, otherwise canonical workspace record.
}

async function sourceValidatedWorkspaceRewards(
  snapshots: Array<{ id: string; data(): RecordValue }>,
  firestore: Firestore,
): Promise<Map<string, RecordValue>> {
  const candidates = new Map<string, RecordValue>();
  for (const snapshot of snapshots) {
    const reward = snapshot.data();
    if (hasActiveSummaryMarker(reward) && canonicalReferralRewardForOverview(snapshot.id, reward)) {
      candidates.set(snapshot.id, reward);
    }
  }
  const validated = await Promise.all([...candidates.entries()].map(async ([rewardId, reward]) => {
    const qualification = trustedQualificationFromEvidence(reward);
    if (!qualification) return null;
    const [bookingSnapshot, evidenceSnapshot, attributionSnapshot, codeSnapshot, programSnapshot] = await Promise.all([
      firestore.collection('bookings').doc(qualification.bookingId).get(),
      firestore.collection('referralBookingEvidence').doc(qualification.bookingId).get(),
      firestore.collection('referralAttributions').doc(qualification.invitedUserId).get(),
      firestore.collection('referralCodes').doc(qualification.code).get(),
      firestore.collection('referralPrograms').doc(qualification.programId).get(),
    ]);
    return hasCanonicalReferralQualificationSources(
      qualification,
      bookingSnapshot.data() as RecordValue | undefined,
      evidenceSnapshot.data() as RecordValue | undefined,
      attributionSnapshot.data() as RecordValue | undefined,
      codeSnapshot.data() as RecordValue | undefined,
      programSnapshot.data() as RecordValue | undefined,
    ) ? { rewardId, reward } : null;
  }));
  return new Map(validated.flatMap(item => item ? [[item.rewardId, item.reward] as [string, RecordValue]] : []));
}

async function sourceValidatedWorkspaceAttribution(
  attribution: RecordValue | undefined,
  firestore: Firestore,
): Promise<RecordValue | undefined> {
  const inviterOwnerType = ownerType(attribution?.inviterOwnerType);
  if (
    !attribution || !hasActiveSummaryMarker(attribution)
    || typeof attribution.code !== 'string' || !CODE_PATTERN.test(attribution.code)
    || typeof attribution.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(attribution.programId)
    || typeof attribution.inviterId !== 'string' || !DOCUMENT_ID_PATTERN.test(attribution.inviterId)
    || !inviterOwnerType || timestampMs(attribution.expiresAt) === undefined
  ) return undefined;
  const [codeSnapshot, programSnapshot] = await Promise.all([
    firestore.collection('referralCodes').doc(attribution.code).get(),
    firestore.collection('referralPrograms').doc(attribution.programId).get(),
  ]);
  const code = codeSnapshot.data() as RecordValue | undefined;
  const program = programSnapshot.data() as RecordValue | undefined;
  if (
    !codeSnapshot.exists || !code || !hasActiveSummaryMarker(code)
    || !programSnapshot.exists || !program || !hasActiveSummaryMarker(program)
    || code.code !== attribution.code || code.programId !== attribution.programId
    || code.ownerId !== attribution.inviterId || ownerType(code.ownerType) !== inviterOwnerType
  ) return undefined;
  return {
    code: attribution.code,
    programId: attribution.programId,
    inviterOwnerType,
    expiresAt: attribution.expiresAt,
  };
}

function ownerSummaryId(ownerTypeValue: OwnerType, ownerId: string): string {
  return `${ownerTypeValue}__${ownerId}`;
}

function ownerProgramCodeId(ownerTypeValue: OwnerType, ownerId: string, programId: string): string {
  return `v1__${ownerTypeValue}__${ownerId.length}__${ownerId}__${programId}`;
}

type ReferralOwnerSummaryRecord = {
  schemaVersion: number;
  summaryEpoch: string;
  ownerType: OwnerType;
  ownerId: string;
  codeCount: number;
  attributionCount: number;
  inviter: RecordValue;
  invitee: RecordValue;
  currentCode?: RecordValue;
};

function newOwnerSummary(ownerTypeValue: OwnerType, ownerId: string): ReferralOwnerSummaryRecord {
  const role = (): RecordValue => ({
    pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotalsByCurrency: {},
  });
  return {
    schemaVersion: REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH, ownerType: ownerTypeValue, ownerId,
    codeCount: 0, attributionCount: 0, inviter: role(), invitee: role(),
  };
}

function writableOwnerSummary(value: RecordValue | undefined, ownerTypeValue: OwnerType, ownerId: string): ReferralOwnerSummaryRecord | null {
  if (!value) return newOwnerSummary(ownerTypeValue, ownerId);
  const safe = safeWorkspaceSummary(value, ownerTypeValue, ownerId);
  if (safe.state !== 'verified') return null;
  const copyRole = (role: ReferralWorkspaceRoleSummary): RecordValue => ({
    pendingCount: role.pendingCount, approvedCount: role.approvedCount, rejectedCount: role.rejectedCount,
    cancelledCount: role.cancelledCount, flaggedPendingCount: role.flaggedPendingCount,
    creditTotalsByCurrency: Object.fromEntries(role.creditTotals.map(total => [total.currency, {
      pendingMinor: total.pendingMinor, approvedMinor: total.approvedMinor,
    }])),
  });
  return {
    schemaVersion: REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH, ownerType: ownerTypeValue, ownerId,
    codeCount: safe.codeCount, attributionCount: safe.attributionCount,
    inviter: copyRole(safe.inviter), invitee: copyRole(safe.invitee),
    ...(safe.currentCode ? { currentCode: safe.currentCode } : {}),
  };
}

async function readOwnerProjection(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
  ownerTypeValue: OwnerType,
  ownerId: string,
  createIfMissing: boolean,
): Promise<{ ref: admin.firestore.DocumentReference; summary: ReferralOwnerSummaryRecord } | null> {
  const ref = firestore.collection('referralOwnerSummaries').doc(ownerSummaryId(ownerTypeValue, ownerId));
  const existing = await transaction.get(ref);
  if (!existing.exists && !createIfMissing) return null;
  const summary = writableOwnerSummary(existing.data() as RecordValue | undefined, ownerTypeValue, ownerId);
  if (!summary) error('failed-precondition', 'Referral owner summary is invalid');
  return { ref, summary };
}

function adjustOwnerSummaryRole(
  summary: ReferralOwnerSummaryRecord,
  role: 'inviter' | 'invitee',
  status: RewardStatus,
  amountMinor: number,
  currency: string,
  direction: 1 | -1,
): void {
  const details = summary[role] as RecordValue;
  const countField = `${status}Count`;
  adjustCount(details, countField, direction);
  if (status === 'pending' || status === 'approved') {
    const totals = details.creditTotalsByCurrency as RecordValue;
    const total = (totals[currency] as RecordValue | undefined) ?? { pendingMinor: 0, approvedMinor: 0 };
    const amountField = status === 'pending' ? 'pendingMinor' : 'approvedMinor';
    if (!SUPPORTED_REFERRAL_CURRENCIES.has(currency) || Object.keys(totals).length >= SUPPORTED_REFERRAL_CURRENCIES.size
      && totals[currency] === undefined) error('failed-precondition', 'Referral owner summary currency is invalid');
    adjustCount(total, amountField, direction * amountMinor);
    totals[currency] = total;
  }
}

async function writeOwnerHistoryProjection(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
  ownerTypeValue: OwnerType,
  ownerId: string,
  role: 'inviter' | 'invitee',
  rewardId: string,
): Promise<void> {
  const ownerKey = ownerSummaryId(ownerTypeValue, ownerId);
  const ref = firestore.collection('referralOwnerHistory').doc(`${ownerKey}__${rewardId}__${role}`);
  transaction.set(ref, {
    schemaVersion: REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION, summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    ownerKey, ownerType: ownerTypeValue, ownerId, role, rewardId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function emptyWorkspaceRoleSummary(): ReferralWorkspaceRoleSummary {
  return { pendingCount: 0, approvedCount: 0, rejectedCount: 0, cancelledCount: 0, flaggedPendingCount: 0, creditTotals: [] };
}

function unavailableWorkspaceSummary(ownerTypeValue: OwnerType): ReferralWorkspaceSummary {
  return {
    ownerType: ownerTypeValue, codeCount: 0, attributionCount: 0,
    inviter: emptyWorkspaceRoleSummary(), invitee: emptyWorkspaceRoleSummary(), state: 'unavailable',
  };
}

function safeWorkspaceRoleSummary(value: unknown): ReferralWorkspaceRoleSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as RecordValue;
  const fields = ['pendingCount', 'approvedCount', 'rejectedCount', 'cancelledCount', 'flaggedPendingCount'];
  if (fields.some(field => !Number.isSafeInteger(input[field]) || (input[field] as number) < 0)) return null;
  const totals = input.creditTotalsByCurrency;
  if (!totals || typeof totals !== 'object' || Array.isArray(totals)) return null;
  const creditTotals = Object.entries(totals as RecordValue).flatMap(([currency, total]) => {
    if (!SUPPORTED_REFERRAL_CURRENCIES.has(currency) || !total || typeof total !== 'object' || Array.isArray(total)) return [];
    const row = total as RecordValue;
    return Number.isSafeInteger(row.pendingMinor) && (row.pendingMinor as number) >= 0
      && Number.isSafeInteger(row.approvedMinor) && (row.approvedMinor as number) >= 0
      ? [{ currency, pendingMinor: row.pendingMinor as number, approvedMinor: row.approvedMinor as number }]
      : [];
  });
  if (creditTotals.length !== Object.keys(totals as RecordValue).length) return null;
  return { ...Object.fromEntries(fields.map(field => [field, input[field] as number])) as Omit<ReferralWorkspaceRoleSummary, 'creditTotals'>, creditTotals };
}

function safeWorkspaceSummary(value: RecordValue | undefined, ownerTypeValue: OwnerType, ownerId: string): ReferralWorkspaceSummary {
  if (
    !value || value.schemaVersion !== REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION || value.summaryEpoch !== REFERRAL_SUMMARY_EPOCH
    || value.ownerType !== ownerTypeValue || value.ownerId !== ownerId
    || !Number.isSafeInteger(value.codeCount) || (value.codeCount as number) < 0
    || !Number.isSafeInteger(value.attributionCount) || (value.attributionCount as number) < 0
  ) return unavailableWorkspaceSummary(ownerTypeValue);
  const inviter = safeWorkspaceRoleSummary(value.inviter);
  const invitee = safeWorkspaceRoleSummary(value.invitee);
  if (!inviter || !invitee) return unavailableWorkspaceSummary(ownerTypeValue);
  const currentCode = value.currentCode;
  const safeCode = currentCode && typeof currentCode === 'object' && !Array.isArray(currentCode)
    ? currentCode as RecordValue : undefined;
  const currentCodeValue = safeCode && typeof safeCode.code === 'string' && CODE_PATTERN.test(safeCode.code)
    && typeof safeCode.programId === 'string' && DOCUMENT_ID_PATTERN.test(safeCode.programId)
    && typeof safeCode.status === 'string'
    ? { code: safeCode.code, programId: safeCode.programId, status: safeCode.status } : undefined;
  if (currentCode !== undefined && !currentCodeValue) return unavailableWorkspaceSummary(ownerTypeValue);
  return {
    ownerType: ownerTypeValue, codeCount: value.codeCount as number, attributionCount: value.attributionCount as number,
    inviter, invitee, state: 'verified', ...(currentCodeValue ? { currentCode: currentCodeValue } : {}),
  };
}

async function authorizeWorkspaceScope(
  uid: string,
  scope: ReferralWorkspaceScope,
  firestore: Firestore,
): Promise<{ ownerType: OwnerType; ownerId: string }> {
  const userSnapshot = await firestore.collection('users').doc(uid).get();
  const profile = userSnapshot.data() as RecordValue | undefined;
  if (!userSnapshot.exists || !hasCanonicalUserIdentity(profile, uid) || profile?.platformAdmin === true || profile?.role === 'superadmin') {
    error('permission-denied', 'This account cannot access referral workspaces');
  }
  if (scope.type === 'brand') {
    const activeBrandMemberships = firestore.collection('memberships')
      .where('userId', '==', uid).where('brandId', '==', scope.brandId).where('status', '==', 'active');
    const [principal, salonAdmin, brand] = await Promise.all([
      activeBrandMemberships.where('role', '==', 'principal_admin').limit(1).get(),
      activeBrandMemberships.where('role', '==', 'salon_admin').limit(1).get(),
      firestore.collection('brands').doc(scope.brandId).get(),
    ]);
    if (!brand.exists || (principal.empty && salonAdmin.empty)) {
      error('permission-denied', 'Brand referral workspace scope is not authorized');
    }
    return { ownerType: 'brand', ownerId: scope.brandId };
  }
  const [freelancerSnapshot, activeMemberships] = await Promise.all([
    firestore.collection('freelancerProfiles').doc(uid).get(),
    firestore.collection('memberships').where('userId', '==', uid).where('status', '==', 'active').limit(1).get(),
  ]);
  if (activeMemberships.empty !== true) error('permission-denied', 'Staff accounts cannot access personal referral workspaces');
  if (scope.type === 'client') {
    if (!isEligiblePersonalReferralIdentity(profile, uid, ['client']) || freelancerSnapshot.exists) {
      error('permission-denied', 'Client referral workspace scope is not authorized');
    }
    return { ownerType: 'client', ownerId: uid };
  }
  if (
    !isEligiblePersonalReferralIdentity(profile, uid, ['client', 'freelancer'])
    || !freelancerSnapshot.exists
    || !hasCanonicalUserIdentity(freelancerSnapshot.data() as RecordValue | undefined, uid)
  ) error('permission-denied', 'Freelancer referral workspace scope is not authorized');
  return { ownerType: 'freelancer', ownerId: uid };
}

export async function getMyReferralWorkspace(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<ReferralWorkspaceV3> {
  const uid = callerUid(caller);
  const input = referralWorkspaceInput(value);
  const { ownerType: ownerTypeValue, ownerId } = await authorizeWorkspaceScope(uid, input.scope, firestore);
  const summaryRef = firestore.collection('referralOwnerSummaries').doc(ownerSummaryId(ownerTypeValue, ownerId));
  const historyCollection = firestore.collection('referralOwnerHistory');
  let historyQuery = historyCollection.where('ownerKey', '==', ownerSummaryId(ownerTypeValue, ownerId))
    .where('role', '==', input.role)
    .where('schemaVersion', '==', REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION)
    .where('summaryEpoch', '==', REFERRAL_SUMMARY_EPOCH)
    .orderBy('createdAt', 'desc').orderBy(DOCUMENT_ID_FIELD_PATH, 'desc');
  if (input.pageToken) {
    const cursor = await historyCollection.doc(input.pageToken).get();
    const cursorData = cursor.data() as RecordValue | undefined;
    if (!cursor.exists || cursorData?.ownerKey !== ownerSummaryId(ownerTypeValue, ownerId)
      || cursorData.ownerType !== ownerTypeValue || cursorData.ownerId !== ownerId || cursorData.role !== input.role
      || cursorData.schemaVersion !== REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION || cursorData.summaryEpoch !== REFERRAL_SUMMARY_EPOCH) {
      error('invalid-argument', 'Referral workspace pageToken is invalid');
    }
    historyQuery = historyQuery.startAfter(cursor);
  }
  const [summarySnapshot, historySnapshot, attributionSnapshot] = await Promise.all([
    summaryRef.get(),
    historyQuery.limit(input.limit + 1).get(),
    input.scope.type === 'client' ? firestore.collection('referralAttributions').doc(uid).get() : Promise.resolve(undefined),
  ]);
  const projectionRows = historySnapshot.docs as Array<{ id: string; data(): RecordValue }>;
  const pageRows = projectionRows.slice(0, input.limit).filter(row => {
    const projection = row.data();
    return projection.ownerId === ownerId && projection.ownerType === ownerTypeValue && projection.role === input.role
      && typeof projection.rewardId === 'string' && DOCUMENT_ID_PATTERN.test(projection.rewardId);
  });
  const rewardSnapshots = await Promise.all(pageRows.map(row => firestore.collection('referralRewards').doc(row.data().rewardId as string).get()));
  const validatedRewards = await sourceValidatedWorkspaceRewards(
    rewardSnapshots as Array<{ id: string; data(): RecordValue }>, firestore,
  );
  const items = await Promise.all(pageRows.map(async row => {
    const rewardId = row.data().rewardId as string;
    const reward = validatedRewards.get(rewardId);
    if (!reward) return null;
    const isOwner = input.role === 'inviter'
      ? reward.inviterOwnerId === ownerId && reward.inviterOwnerType === ownerTypeValue
      : reward.invitedOwnerId === ownerId && reward.invitedOwnerType === ownerTypeValue;
    const amountMinor = input.role === 'inviter' ? reward.inviterCreditMinor : reward.invitedDiscountMinor;
    if (!isOwner || !Number.isSafeInteger(amountMinor) || (amountMinor as number) < 0 || typeof reward.currency !== 'string'
      || !CURRENCY_PATTERN.test(reward.currency) || !['pending', 'approved', 'rejected', 'cancelled'].includes(String(reward.status))) return null;
    if (reward.status === 'approved') {
      const ledgerId = `${rewardId}__${input.role === 'inviter' ? 'inviter' : 'invited'}`;
      const ledger = await firestore.collection('creditLedgers').doc(ledgerId).get();
      if (!canonicalApprovedCreditLedgerForOverview(ledger as { id: string; data(): RecordValue }, validatedRewards)) return null;
    }
    return {
      id: rewardId, ownerType: ownerTypeValue, role: input.role, amountMinor: amountMinor as number,
      currency: reward.currency, status: reward.status as RewardStatus,
      ...(timestampIso(reward.createdAt) ? { createdAt: timestampIso(reward.createdAt) as string } : {}),
    } as ReferralWorkspaceHistoryItem;
  }));
  const attribution = attributionSnapshot ? await sourceValidatedWorkspaceAttribution(
    attributionSnapshot.data() as RecordValue | undefined, firestore,
  ) : undefined;
  let summary = safeWorkspaceSummary(summarySnapshot.data() as RecordValue | undefined, ownerTypeValue, ownerId);
  if (summary.state === 'verified' && summary.currentCode) {
    const [codeSnapshot, programSnapshot] = await Promise.all([
      firestore.collection('referralCodes').doc(summary.currentCode.code).get(),
      firestore.collection('referralPrograms').doc(summary.currentCode.programId).get(),
    ]);
    const code = codeSnapshot.data() as RecordValue | undefined;
    const program = programSnapshot.data() as RecordValue | undefined;
    if (!codeSnapshot.exists || !hasActiveSummaryMarker(code)
      || code?.code !== summary.currentCode.code || code.programId !== summary.currentCode.programId
      || code.ownerType !== ownerTypeValue || code.ownerId !== ownerId || code.status !== summary.currentCode.status
      || !programSnapshot.exists || !hasActiveSummaryMarker(program)) {
      summary = unavailableWorkspaceSummary(ownerTypeValue);
    }
  }
  return {
    contractVersion: 3,
    scope: input.scope,
    summary,
    ...(attribution ? { attribution: {
      code: attribution.code as string,
      programId: attribution.programId as string,
      inviterOwnerType: attribution.inviterOwnerType as OwnerType,
      expiresAt: timestampIso(attribution.expiresAt) as string,
    } } : {}),
    history: {
      role: input.role,
      items: items.flatMap(item => item ? [item] : []),
      ...(projectionRows.length > input.limit ? { nextPageToken: projectionRows[input.limit - 1].id } : {}),
      truncated: projectionRows.length > input.limit,
    },
  };
}

async function validatedPublicReferralCode(
  value: unknown,
  firestore: Firestore,
  currentTime: Date,
): Promise<{ code: string; programId: string; countryCode: string }> {
  const { code, countryCode } = referralCodeLookup(value);
  const codeSnapshot = await firestore.collection('referralCodes').doc(code).get();
  const referralCode = codeSnapshot.data() as RecordValue | undefined;
  if (
    !codeSnapshot.exists || !referralCode || referralCode.status !== 'active' || !hasActiveSummaryMarker(referralCode)
    || (referralCode.ownerType !== 'client' && referralCode.ownerType !== 'freelancer' && referralCode.ownerType !== 'brand')
    || typeof referralCode.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.ownerId)
    || typeof referralCode.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.programId)
  ) error('not-found', 'Referral code is unavailable');
  const program = (await firestore.collection('referralPrograms').doc(referralCode.programId).get()).data() as RecordValue | undefined;
  if (!validProgram(program, countryCode, currentTime) || !hasActiveSummaryMarker(program)) {
    error('not-found', 'Referral code is unavailable');
  }
  return { code, programId: referralCode.programId, countryCode };
}

export async function getPublicReferralCode(
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ code: string; status: 'active' }> {
  const referralCode = await validatedPublicReferralCode(value, firestore, currentTime);
  return { code: referralCode.code, status: 'active' };
}

export async function recordReferralVisit(
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<PublicReferralVisitResult> {
  const { code, countryCode } = referralCodeLookup(value);
  const recorded = await firestore.runTransaction(async transaction => {
    const codeRef = firestore.collection('referralCodes').doc(code);
    const telemetry = firestore.collection('referralTelemetry');
    const totalRef = telemetry.doc('overview');
    const [codeSnapshot, totalSnapshot] = await transaction.getAll(codeRef, totalRef);
    const referralCode = codeSnapshot.data() as RecordValue | undefined;
    if (
      !codeSnapshot.exists || !referralCode || referralCode.status !== 'active' || !hasActiveSummaryMarker(referralCode)
      || (referralCode.ownerType !== 'client' && referralCode.ownerType !== 'freelancer' && referralCode.ownerType !== 'brand')
      || typeof referralCode.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.ownerId)
      || typeof referralCode.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.programId)
    ) error('not-found', 'Referral code is unavailable');
    const programRef = firestore.collection('referralPrograms').doc(referralCode.programId);
    const programSnapshot = await transaction.get(programRef);
    if (!validProgram(programSnapshot.data() as RecordValue | undefined, countryCode, currentTime)
      || !hasActiveSummaryMarker(programSnapshot.data() as RecordValue | undefined)) {
      error('not-found', 'Referral code is unavailable');
    }
    const total = totalSnapshot.data()?.validatedVisitCount;
    if (totalSnapshot.exists && (totalSnapshot.data()?.schemaVersion !== REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
      || totalSnapshot.data()?.summaryEpoch !== REFERRAL_SUMMARY_EPOCH)) {
      error('failed-precondition', 'Referral telemetry projection migration is required');
    }
    if (total !== undefined && (!Number.isSafeInteger(total) || (total as number) < 0)) {
      error('failed-precondition', 'Referral telemetry is invalid');
    }
    const validatedVisitCount = (total as number | undefined) ?? 0;
    if (validatedVisitCount >= MAX_VALIDATED_VISITS_TOTAL) return false;
    const codeTelemetryRef = telemetry.doc(`${referralCode.programId}__${code}`);
    const codeTelemetrySnapshot = await transaction.get(codeTelemetryRef);
    if (codeTelemetrySnapshot.exists && (codeTelemetrySnapshot.data()?.schemaVersion !== REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
      || codeTelemetrySnapshot.data()?.summaryEpoch !== REFERRAL_SUMMARY_EPOCH
      || codeTelemetrySnapshot.data()?.code !== code || codeTelemetrySnapshot.data()?.programId !== referralCode.programId)) {
      error('failed-precondition', 'Referral telemetry projection migration is required');
    }
    const codeTotal = codeTelemetrySnapshot.data()?.validatedVisitCount;
    if (codeTotal !== undefined && (!Number.isSafeInteger(codeTotal) || (codeTotal as number) < 0)) {
      error('failed-precondition', 'Referral telemetry is invalid');
    }
    const codeValidatedVisitCount = (codeTotal as number | undefined) ?? 0;
    if (codeValidatedVisitCount >= MAX_VALIDATED_VISITS_PER_CODE) return false;
    const programProjection = await readProgramSummary(transaction, firestore, referralCode.programId);
    adjustCount(programProjection.summary as unknown as RecordValue, 'validatedVisitCount', 1);
    writeProjection(transaction, programProjection.ref, programProjection.summary as unknown as RecordValue);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(totalRef, {
      schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      validatedVisitCount: validatedVisitCount + 1,
      updatedAt: now,
    });
    transaction.set(codeTelemetryRef, {
      code,
      programId: referralCode.programId,
      countryCode,
      schemaVersion: REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION,
      summaryEpoch: REFERRAL_SUMMARY_EPOCH,
      validatedVisitCount: codeValidatedVisitCount + 1,
      updatedAt: now,
    });
    return true;
  });
  return { code, status: 'active', recorded };
}

function canonicalReferralRewardForOverview(id: string, reward: RecordValue): boolean {
  const qualification = trustedQualificationFromEvidence(reward);
  const completionEvidence = qualification ? referralCompletionEvidence({
    version: qualification.eligibilityEvidenceVersion,
    eventId: qualification.eligibilityEvidenceEventId,
    updateTimeMs: qualification.eligibilityEvidenceUpdateTimeMs,
  }) : null;
  return qualification !== null
    && qualification.rewardId === id
    && id === `${qualification.programId}__${qualification.invitedUserId}`
    && qualification.inviterId === qualification.inviterOwnerId
    && qualification.invitedUserId === qualification.invitedOwnerId
    && isTrustedCompletionEvidence(completionEvidence, qualification.eligibleCompletedAtMs, {
      version: qualification.eligibilityEvidenceVersion,
      notBeforeAtMs: qualification.eligibilityProgramNotBeforeAtMs,
    })
    && (reward.status === 'pending' || reward.status === 'approved' || reward.status === 'rejected' || reward.status === 'cancelled');
}

function safePendingRewardForOverview(id: string, reward: RecordValue): ReferralPendingRewardOverview | null {
  if (
    !canonicalReferralRewardForOverview(id, reward)
    || reward.status !== 'pending' || typeof reward.programId !== 'string' || typeof reward.bookingId !== 'string'
    || typeof reward.inviterId !== 'string' || typeof reward.invitedUserId !== 'string'
    || !Number.isSafeInteger(reward.inviterCreditMinor) || (reward.inviterCreditMinor as number) < 0
    || !Number.isSafeInteger(reward.invitedDiscountMinor) || (reward.invitedDiscountMinor as number) < 0
    || typeof reward.currency !== 'string' || !CURRENCY_PATTERN.test(reward.currency)
  ) return null;
  const fraudFlag = reward.fraudFlag as RecordValue | undefined;
  const safeFraudFlag: ReferralFraudFlag | undefined = fraudFlag
    && (fraudFlag.status === 'flagged' || fraudFlag.status === 'cleared')
    && typeof fraudFlag.reason === 'string'
    ? { status: fraudFlag.status, reason: fraudFlag.reason }
    : undefined;
  return {
    id,
    programId: reward.programId,
    bookingId: reward.bookingId,
    inviterId: reward.inviterId,
    invitedUserId: reward.invitedUserId,
    inviterCreditMinor: reward.inviterCreditMinor as number,
    invitedDiscountMinor: reward.invitedDiscountMinor as number,
    currency: reward.currency as string,
    status: 'pending',
    ...(safeFraudFlag ? { fraudFlag: safeFraudFlag } : {}),
    ...(timestampIso(reward.createdAt) === undefined ? {} : { createdAt: timestampIso(reward.createdAt) }),
  };
}

type CanonicalApprovedCreditLedger = {
  rewardId: string;
  ownerId: string;
  ownerType: OwnerType;
  currency: string;
  amountMinor: number;
  kind: 'referral_inviter_credit' | 'referral_invited_discount';
};

function canonicalApprovedCreditLedgerForOverview(
  snapshot: { id: string; data(): RecordValue },
  rewardsById: Map<string, RecordValue>,
): CanonicalApprovedCreditLedger | null {
  const ledger = snapshot.data();
  const kind = ledger.kind;
  const ownerTypeValue = ownerType(ledger.ownerType);
  if (
    ledger.status !== 'approved'
    || (kind !== 'referral_inviter_credit' && kind !== 'referral_invited_discount')
    || typeof ledger.rewardId !== 'string' || !DOCUMENT_ID_PATTERN.test(ledger.rewardId)
    || typeof ledger.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(ledger.ownerId)
    || !ownerTypeValue
    || typeof ledger.currency !== 'string' || !CURRENCY_PATTERN.test(ledger.currency)
    || !Number.isSafeInteger(ledger.amountMinor) || (ledger.amountMinor as number) < 0
    || snapshot.id !== `${ledger.rewardId}__${kind === 'referral_inviter_credit' ? 'inviter' : 'invited'}`
  ) return null;
  const reward = rewardsById.get(ledger.rewardId);
  if (
    !reward || reward.status !== 'approved'
    || !canonicalReferralRewardForOverview(ledger.rewardId, reward)
  ) return null;
  const expectedOwnerId = kind === 'referral_inviter_credit' ? reward.inviterOwnerId : reward.invitedOwnerId;
  const expectedOwnerType = kind === 'referral_inviter_credit' ? ownerType(reward.inviterOwnerType) : ownerType(reward.invitedOwnerType);
  const expectedAmount = kind === 'referral_inviter_credit' ? reward.inviterCreditMinor : reward.invitedDiscountMinor;
  if (
    typeof expectedOwnerId !== 'string' || expectedOwnerId !== ledger.ownerId || expectedOwnerType !== ownerTypeValue
    || reward.currency !== ledger.currency || expectedAmount !== ledger.amountMinor
  ) return null;
  return {
    rewardId: ledger.rewardId,
    ownerId: ledger.ownerId,
    ownerType: ownerTypeValue,
    currency: ledger.currency,
    amountMinor: ledger.amountMinor as number,
    kind,
  };
}

function safeReferralAuditForOverview(id: string, event: RecordValue): ReferralAuditEntry | null {
  if (!hasActiveSummaryMarker(event) || typeof event.action !== 'string' || !event.action.startsWith('REFERRAL_')) return null;
  const item: ReferralAuditEntry = { id, action: event.action };
  if (typeof event.rewardId === 'string' && DOCUMENT_ID_PATTERN.test(event.rewardId)) item.rewardId = event.rewardId;
  if (typeof event.programId === 'string' && DOCUMENT_ID_PATTERN.test(event.programId)) item.programId = event.programId;
  if (typeof event.code === 'string' && CODE_PATTERN.test(event.code)) item.code = event.code;
  if (typeof event.actorUid === 'string' && DOCUMENT_ID_PATTERN.test(event.actorUid)) item.actorUid = event.actorUid;
  if (typeof event.reason === 'string' && event.reason.length > 0 && event.reason.length <= 500) item.reason = event.reason;
  const createdAt = timestampIso(event.createdAt);
  if (createdAt !== undefined) item.createdAt = createdAt;
  return item;
}

export async function getReferralMarketingOverview(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  verifiedPlatformAdmin = false,
): Promise<ReferralMarketingOverview> {
  const uid = callerUid(caller);
  await requireSuperAdmin(uid, firestore, verifiedPlatformAdmin);
  const input = referralMarketingOverviewInput(value);
  const marketingSnapshot = await firestore.collection('referralMarketingSummaries').doc('overview').get();
  const marketing = safeMarketingSummary(marketingSnapshot.data() as RecordValue | undefined);
  const emptyPage = <T>(): ReferralOverviewPage<T> => ({ items: [], truncated: false });
  const emptyResult = (): ReferralMarketingOverview => ({
    contractVersion: 3,
    state: 'migrationRequired',
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    telemetry: { state: 'unavailable', validatedVisits: 0, capped: false },
    programs: emptyPage(),
    funnel: {
      codes: 0, validatedVisits: 0, attributions: 0, attributedSignups: 0,
      rewards: 0, eligibleFirstBookings: 0, pending: 0, pendingRewards: 0,
      approved: 0, approvedRewards: 0, rejected: 0, cancelled: 0,
    },
    approvedCreditTotals: [],
    topReferrers: emptyPage(),
    pendingRewards: emptyPage(),
    flaggedRewards: emptyPage(),
    auditTrail: emptyPage(),
  });
  if (!marketingSnapshot.exists || !marketing) return emptyResult();

  const programSummaries = firestore.collection('referralProgramSummaries');
  let programQuery: admin.firestore.Query = programSummaries
    .where('schemaVersion', '==', REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION)
    .where('summaryEpoch', '==', REFERRAL_SUMMARY_EPOCH)
    .orderBy('updatedAt', 'desc').orderBy(DOCUMENT_ID_FIELD_PATH, 'desc');
  if (input.programPageToken) {
    const cursor = await programSummaries.doc(input.programPageToken).get();
    if (!cursor.exists || !safeProgramSummary(cursor.data() as RecordValue | undefined, cursor.id)) {
      error('invalid-argument', 'programPageToken is invalid');
    }
    programQuery = programQuery.startAfter(cursor);
  }

  const rewardQuery = async (flagged: boolean): Promise<ReferralOverviewPage<ReferralPendingRewardOverview>> => {
    const limit = flagged ? input.flaggedLimit : input.pendingLimit;
    const token = flagged ? input.flaggedPageToken : input.pendingPageToken;
    let query: admin.firestore.Query = firestore.collection('referralRewards')
      .where('status', '==', 'pending')
      .where('summaryVersion', '==', REFERRAL_CANONICAL_SUMMARY_VERSION)
      .where('summaryEpoch', '==', REFERRAL_SUMMARY_EPOCH);
    if (flagged) query = query.where('fraudFlag.status', '==', 'flagged');
    query = query.orderBy('createdAt', 'desc').orderBy(DOCUMENT_ID_FIELD_PATH, 'desc');
    if (token) {
      const cursor = await firestore.collection('referralRewards').doc(token).get();
      const cursorValue = cursor.data() as RecordValue | undefined;
      if (!cursor.exists || cursorValue?.status !== 'pending' || !hasActiveSummaryMarker(cursorValue)
        || (flagged && (cursorValue.fraudFlag as RecordValue | undefined)?.status !== 'flagged')) {
        error('invalid-argument', `${flagged ? 'flagged' : 'pending'}PageToken is invalid`);
      }
      query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(limit + 1).get();
    const rows = snapshot.docs.slice(0, limit) as Array<{ id: string; data(): RecordValue }>;
    const validated = await sourceValidatedWorkspaceRewards(rows, firestore);
    const items = rows.flatMap(row => {
      const reward = validated.get(row.id);
      const item = reward ? safePendingRewardForOverview(row.id, reward) : null;
      if (!item) return [];
      if (!flagged) return [item];
      return item.fraudFlag?.status === 'flagged'
        ? [{ ...item, fraudFlag: { status: 'flagged' as const, reason: item.fraudFlag.reason } }]
        : [];
    });
    return {
      items,
      ...(snapshot.docs.length > limit && rows.length ? { nextPageToken: rows[rows.length - 1].id } : {}),
      truncated: snapshot.docs.length > limit,
    };
  };

  const audit = firestore.collection('referralAudit');
  let auditQuery: admin.firestore.Query = audit
    .where('summaryVersion', '==', REFERRAL_CANONICAL_SUMMARY_VERSION)
    .where('summaryEpoch', '==', REFERRAL_SUMMARY_EPOCH);
  auditQuery = input.code ? auditQuery.where('code', '==', input.code)
    : input.programId ? auditQuery.where('programId', '==', input.programId)
      : input.rewardId ? auditQuery.where('rewardId', '==', input.rewardId)
        : input.action ? auditQuery.where('action', '==', input.action) : auditQuery;
  auditQuery = auditQuery.orderBy('createdAt', 'desc').orderBy(DOCUMENT_ID_FIELD_PATH, 'desc');
  if (input.auditPageToken) {
    const cursor = await audit.doc(input.auditPageToken).get();
    const cursorValue = cursor.data() as RecordValue | undefined;
    const matchesFilter = (!input.code || cursorValue?.code === input.code)
      && (!input.programId || cursorValue?.programId === input.programId)
      && (!input.rewardId || cursorValue?.rewardId === input.rewardId)
      && (!input.action || cursorValue?.action === input.action);
    if (!cursor.exists || !safeReferralAuditForOverview(cursor.id, cursorValue ?? {}) || !matchesFilter) {
      error('invalid-argument', 'auditPageToken is invalid');
    }
    auditQuery = auditQuery.startAfter(cursor);
  }

  const [programSnapshot, topSnapshot, pendingRewards, flaggedRewards, auditSnapshot, telemetrySnapshot] = await Promise.all([
    programQuery.limit(input.programLimit + 1).get(),
    firestore.collection('referralReferrerSummaries')
      .where('schemaVersion', '==', REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION)
      .where('summaryEpoch', '==', REFERRAL_SUMMARY_EPOCH)
      .orderBy('attributionCount', 'desc').orderBy('rewardCount', 'desc').orderBy(DOCUMENT_ID_FIELD_PATH, 'asc')
      .limit(TOP_REFERRER_RESULTS + 1).get(),
    rewardQuery(false),
    rewardQuery(true),
    auditQuery.limit(input.auditLimit + 1).get(),
    firestore.collection('referralTelemetry').doc('overview').get(),
  ]);
  const programRows = programSnapshot.docs.slice(0, input.programLimit);
  const programs = programRows.flatMap(snapshot => {
    const summary = safeProgramSummary(snapshot.data() as RecordValue | undefined, snapshot.id);
    return summary ? [{
      id: summary.programId, status: summary.status, countryCodes: summary.countryCodes,
      currency: summary.currency, inviterCreditMinor: summary.inviterCreditMinor,
      invitedDiscountMinor: summary.invitedDiscountMinor, startsAt: summary.startsAt, endsAt: summary.endsAt,
    }] : [];
  });
  const topRows = topSnapshot.docs.slice(0, TOP_REFERRER_RESULTS);
  const topReferrers = topRows.flatMap(snapshot => {
    const data = snapshot.data() as RecordValue;
    const type = ownerType(data.inviterOwnerType);
    if (!type || typeof data.inviterId !== 'string') return [];
    const summary = safeReferrerSummary(data, type, data.inviterId);
    if (!summary || snapshot.id !== ownerSummaryId(type, data.inviterId)) return [];
    return [{
      inviterId: summary.inviterId,
      inviterOwnerType: summary.inviterOwnerType,
      referrals: summary.attributionCount,
      rewards: summary.rewardCount,
      approvedCreditTotals: Object.entries(summary.approvedCreditTotalsByCurrency)
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
    }];
  });
  const auditRows = auditSnapshot.docs.slice(0, input.auditLimit);
  const auditTrail = auditRows.flatMap(snapshot => {
    const item = safeReferralAuditForOverview(snapshot.id, snapshot.data() as RecordValue);
    return item ? [item] : [];
  });
  const telemetryValue = telemetrySnapshot.data() as RecordValue | undefined;
  const telemetryVerified = !telemetrySnapshot.exists || (
    telemetryValue?.schemaVersion === REFERRAL_MARKETING_SUMMARY_SCHEMA_VERSION
    && telemetryValue.summaryEpoch === REFERRAL_SUMMARY_EPOCH
    && nonNegativeSafeInteger(telemetryValue.validatedVisitCount)
  );
  const validatedVisits = telemetryVerified && telemetrySnapshot.exists
    ? telemetryValue?.validatedVisitCount as number : 0;
  const page = <T>(items: T[], rows: Array<{ id: string }>, fetched: number, limit: number): ReferralOverviewPage<T> => ({
    items,
    ...(fetched > limit && rows.length ? { nextPageToken: rows[rows.length - 1].id } : {}),
    truncated: fetched > limit,
  });
  return {
    contractVersion: 3,
    state: 'ready',
    summaryEpoch: REFERRAL_SUMMARY_EPOCH,
    telemetry: {
      state: telemetryVerified ? 'verified' : 'unavailable',
      validatedVisits,
      capped: validatedVisits >= MAX_VALIDATED_VISITS_TOTAL,
    },
    programs: page(programs, programRows, programSnapshot.docs.length, input.programLimit),
    funnel: {
      codes: marketing.codeCount,
      validatedVisits,
      attributions: marketing.attributionCount,
      attributedSignups: marketing.attributionCount,
      rewards: marketing.rewardCount,
      eligibleFirstBookings: marketing.rewardCount,
      pending: marketing.pendingRewardCount,
      pendingRewards: marketing.pendingRewardCount,
      approved: marketing.approvedRewardCount,
      approvedRewards: marketing.approvedRewardCount,
      rejected: marketing.rejectedRewardCount,
      cancelled: marketing.cancelledRewardCount,
    },
    approvedCreditTotals: Object.entries(marketing.approvedCreditTotalsByCurrency)
      .map(([currency, amountMinor]) => ({ currency, amountMinor }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    topReferrers: page(topReferrers, topRows, topSnapshot.docs.length, TOP_REFERRER_RESULTS),
    pendingRewards,
    flaggedRewards: flaggedRewards as ReferralOverviewPage<ReferralPendingRewardOverview & { fraudFlag: { status: 'flagged'; reason: string } }>,
    auditTrail: page(auditTrail, auditRows, auditSnapshot.docs.length, input.auditLimit),
  };
}

function requirePlatformAdminContext(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) error('unauthenticated', 'Authentication is required');
  if (context.auth?.token.superadmin !== true && context.auth?.token.platformAdmin !== true) {
    error('permission-denied', 'Super Admin permission is required');
  }
  return uid;
}

export const createReferralProgramFunction = functions.https.onCall((data, context) => (
  createReferralProgram(requirePlatformAdminContext(context), data, admin.firestore(), new Date(), true)
));

export const createMyReferralCodeFunction = functions.https.onCall((data, context) => (
  createMyReferralCode(
    context.auth?.uid ?? null,
    data,
    admin.firestore(),
    new Date(),
    generatedReferralCode,
    context.auth?.token.superadmin === true || context.auth?.token.platformAdmin === true,
  )
));

export const attributeReferralFunction = functions.https.onCall((data, context) => (
  attributeReferral(
    context.auth?.uid ?? null,
    data,
    admin.firestore(),
    new Date(),
    context.auth?.token.superadmin === true || context.auth?.token.platformAdmin === true,
  )
));

export const reviewReferralRewardFunction = functions.https.onCall((data, context) => (
  reviewReferralReward(requirePlatformAdminContext(context), data, admin.firestore(), true)
));

export const setReferralRewardFlagFunction = functions.https.onCall((data, context) => (
  setReferralRewardFlag(requirePlatformAdminContext(context), data, admin.firestore(), true)
));

export const getMyReferralWorkspaceFunction = functions.https.onCall((data, context) => (
  getMyReferralWorkspace(context.auth?.uid ?? null, data)
));

export const getPublicReferralCodeFunction = functions.https.onCall(data => (
  getPublicReferralCode(data)
));

export const recordReferralVisitFunction = functions.runWith(referralVisitCallableOptions).https.onCall((data, context) => {
  if (!context.app) {
    error('unauthenticated', 'Firebase App Check is required for referral telemetry');
  }
  if (!canRecordReferralVisit(context.app)) {
    error('resource-exhausted', 'Referral visit telemetry token was already consumed');
  }
  return recordReferralVisit(data);
});

export const getReferralMarketingOverviewFunction = functions.https.onCall((data, context) => (
  getReferralMarketingOverview(requirePlatformAdminContext(context), data, admin.firestore(), true)
));
