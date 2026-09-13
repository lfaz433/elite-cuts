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

export type ReferralAuditFilter =
  | { limit?: number; code?: never; programId?: never; rewardId?: never; action?: never }
  | { code: string; limit?: number; programId?: never; rewardId?: never; action?: never }
  | { programId: string; limit?: number; code?: never; rewardId?: never; action?: never }
  | { rewardId: string; limit?: number; code?: never; programId?: never; action?: never }
  | { action: string; limit?: number; code?: never; programId?: never; rewardId?: never };

export interface ReferralMarketingOverview {
  contractVersion: 2;
  programs: ReferralProgramOverview[];
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
  };
  approvedCreditTotals: ReferralCreditTotal[];
  topReferrers: ReferralTopReferrer[];
  pendingRewards: ReferralPendingRewardOverview[];
  flaggedRewards: Array<ReferralPendingRewardOverview & { fraudFlag: { status: 'flagged'; reason: string } }>;
  auditTrail: ReferralAuditEntry[];
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
const MAX_VALIDATED_VISITS_PER_CODE = 10_000;
const MAX_VALIDATED_VISITS_TOTAL = 1_000_000;
const REFERRAL_ELIGIBILITY_EVIDENCE_VERSION = 1;
const MAX_WORKSPACE_HISTORY_RESULTS = 20;
const DEFAULT_WORKSPACE_HISTORY_RESULTS = 10;
const REFERRAL_OWNER_SUMMARY_SCHEMA_VERSION = 1;
// Fresh staging rollout marker. Rows without this exact server-selected epoch are
// quarantined rather than being interpreted as a zero-valued legacy workspace.
const REFERRAL_SUMMARY_EPOCH = 'referral-v3';

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
    && CURRENCY_PATTERN.test(program.currency)
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

function isBrandAdminMembership(membership: RecordValue, uid: string): boolean {
  return membership.userId === uid
    && membership.status === 'active'
    && typeof membership.brandId === 'string'
    && DOCUMENT_ID_PATTERN.test(membership.brandId)
    && (membership.role === 'principal_admin' || membership.role === 'salon_admin');
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

function principalKey(ownerId: string, ownerTypeValue: OwnerType): string {
  return `${ownerTypeValue}:${ownerId}`;
}

function activeMembershipsFor(uid: string, snapshots: Array<{ data(): RecordValue }>): RecordValue[] {
  return snapshots.map(snapshot => snapshot.data()).filter(membership => (
    membership.userId === uid && membership.status === 'active'
  ));
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

function referralAuditQuery(value: unknown): {
  code?: string; programId?: string; rewardId?: string; action?: string; limit: number;
} {
  const input = record(value, ['code', 'programId', 'rewardId', 'action', 'limit'], 'Referral marketing overview filters are invalid');
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
  const limit = input.limit === undefined ? DEFAULT_REFERRAL_AUDIT_RESULTS : input.limit;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_REFERRAL_AUDIT_RESULTS) {
    error('invalid-argument', 'limit is invalid');
  }
  return {
    ...(code ? { code } : {}),
    ...(programId ? { programId } : {}),
    ...(rewardId ? { rewardId } : {}),
    ...(action ? { action } : {}),
    limit: limit as number,
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
  if (typeof input.currency !== 'string' || !CURRENCY_PATTERN.test(input.currency.trim().toUpperCase())) {
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
    const [existing, activeProgramState, activePrograms] = await Promise.all([
      transaction.get(programRef),
      transaction.get(activeProgramStateRef),
      transaction.get(firestore.collection('referralPrograms').where('status', '==', 'active')),
    ]);
    const activeProgramId = activeProgramState.data()?.programId;
    if (input.status === 'active') {
      if (
        (typeof activeProgramId === 'string' && activeProgramId !== programRef.id)
        || activePrograms.docs.some(program => program.id !== programRef.id)
      ) error('failed-precondition', 'Only one referral program may be active');
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
      ...(existing.exists ? {} : { createdBy: uid, createdAt: now }),
      ...(activatesEligibilityEvidence ? {
        eligibilityEvidenceVersion: REFERRAL_ELIGIBILITY_EVIDENCE_VERSION,
        eligibilityEvidenceNotBeforeAt: currentTime.toISOString(),
      } : {}),
    };
    if (existing.exists) transaction.update(programRef, program);
    else transaction.create(programRef, program);
    if (input.status === 'active') {
      transaction.set(activeProgramStateRef, { programId: programRef.id, updatedAt: now });
    } else if (activeProgramId === programRef.id || existing.data()?.status === 'active') {
      transaction.set(activeProgramStateRef, { programId: null, updatedAt: now });
    }
    transaction.create(auditRef, {
      action: existing.exists ? 'REFERRAL_PROGRAM_UPDATED' : 'REFERRAL_PROGRAM_CREATED',
      actorUid: uid, programId: programRef.id, status: input.status, createdAt: now,
    });
    transaction.create(referralAuditRef, {
      action: existing.exists ? 'REFERRAL_PROGRAM_UPDATED' : 'REFERRAL_PROGRAM_CREATED',
      actorUid: uid, programId: programRef.id, createdAt: now,
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
  const referralAuditRef = firestore.collection('referralAudit').doc();
  await firestore.runTransaction(async transaction => {
    const reads = await Promise.all([
      transaction.get(programRef),
      transaction.get(codeRef),
      ...(membershipRef ? [transaction.get(membershipRef)] : []),
    ]);
    const program = reads[0].data() as RecordValue | undefined;
    if (!validProgram(program, 'FR', currentTime)) error('failed-precondition', 'Referral program is not active');
    if (reads[1].exists) error('already-exists', 'Referral code is already reserved');
    if (membershipRef) {
      const membership = reads[2].data() as RecordValue | undefined;
      if (
        !membership || membership.userId !== uid || membership.brandId !== ownerId
        || membership.role !== 'principal_admin' || membership.status !== 'active'
      ) error('permission-denied', 'Brand referral codes require a Principal Admin');
    }
    transaction.create(codeRef, {
      code, programId, ownerType: ownerType as OwnerType, ownerId, status: 'active',
      createdBy: uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await updateOwnerSummary(transaction, firestore, ownerType as OwnerType, ownerId, summary => {
      summary.codeCount += 1;
      summary.currentCode = { code, programId, status: 'active' };
    });
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_CODE_CREATED', actorUid: uid, programId, code, createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
      const membershipQuery = firestore.collection('memberships').where('userId', '==', uid);
      const [stateSnapshot, userSnapshot, freelancerSnapshot, membershipSnapshots] = await Promise.all([
        transaction.get(stateRef),
        transaction.get(userRef),
        transaction.get(freelancerRef),
        transaction.get(membershipQuery),
      ]);
      const programId = stateSnapshot.data()?.programId;
      if (typeof programId !== 'string' || !DOCUMENT_ID_PATTERN.test(programId)) {
        error('failed-precondition', 'There is no active referral program');
      }
      const programSnapshot = await transaction.get(firestore.collection('referralPrograms').doc(programId));
      if (!validProgram(programSnapshot.data() as RecordValue | undefined, 'FR', currentTime)) {
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
      const activeMemberships = activeMembershipsFor(uid, membershipSnapshots.docs);
      let ownerType: OwnerType;
      let ownerId: string;
      if (selectedScope.type === 'client') {
        if (
          !isEligiblePersonalReferralIdentity(profile, uid, ['client'])
          || freelancerSnapshot.exists
          || activeMemberships.length > 0
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
          || activeMemberships.length > 0
        ) {
          error('permission-denied', 'This account cannot create freelancer referral codes');
        }
        ownerType = 'freelancer';
        ownerId = uid;
      } else {
        const hasBrandMembership = membershipSnapshots.docs.some(snapshot => {
          const membership = snapshot.data() as RecordValue;
          return isBrandAdminMembership(membership, uid) && membership.brandId === selectedScope.brandId;
        });
        if (!hasBrandMembership) error('permission-denied', 'Brand referral code scope is not authorized');
        const brandSnapshot = await transaction.get(firestore.collection('brands').doc(selectedScope.brandId));
        if (!brandSnapshot.exists) error('permission-denied', 'Brand referral code scope is not authorized');
        ownerType = 'brand';
        ownerId = selectedScope.brandId;
      }
      const existingCodes = await transaction.get(
        firestore.collection('referralCodes').where('ownerId', '==', ownerId).where('ownerType', '==', ownerType),
      );
      const existing = existingCodes.docs
        .map(snapshot => ({ id: snapshot.id, value: snapshot.data() as RecordValue }))
        .filter(({ value: code }) => (
          code.programId === programId && code.status === 'active'
        ))
        .sort((left, right) => left.id.localeCompare(right.id))[0];
      if (existing && typeof existing.value.code === 'string' && CODE_PATTERN.test(existing.value.code)) {
        return { code: existing.value.code, ownerType, programId, reused: true };
      }
      const codeRef = firestore.collection('referralCodes').doc(candidate);
      if ((await transaction.get(codeRef)).exists) return null;
      transaction.create(codeRef, {
        code: candidate,
        programId,
        ownerType,
        ownerId,
        status: 'active',
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await updateOwnerSummary(transaction, firestore, ownerType, ownerId, summary => {
        summary.codeCount += 1;
        summary.currentCode = { code: candidate, programId, status: 'active' };
      });
      transaction.create(referralAuditRef, {
        action: 'REFERRAL_CODE_CREATED', actorUid: uid, programId, code: candidate,
        ownerId, ownerType, createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
  const memberships = firestore.collection('memberships').where('userId', '==', uid);
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
    if (!codeSnapshot.exists || !referralCode || referralCode.status !== 'active') {
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
      || activeMembershipsFor(uid, membershipSnapshots.docs).length > 0
    ) error('permission-denied', 'Referral attribution is available only to client accounts');
    const programRef = firestore.collection('referralPrograms').doc(referralCode.programId);
    const existingBookings = firestore.collection('bookings').where('clientId', '==', uid);
    const [programSnapshot, bookings] = await Promise.all([transaction.get(programRef), transaction.get(existingBookings)]);
    if (!validProgram(programSnapshot.data() as RecordValue | undefined, countryCode, currentTime)) {
      error('failed-precondition', 'Referral program is not available');
    }
    if (!bookings.empty) error('failed-precondition', 'Referral attribution is available only to new clients');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(attributionRef, {
      code,
      programId: referralCode.programId,
      inviterId: referralCode.ownerId,
      inviterOwnerType,
      countryCode,
      expiresAt: new Date(currentTime.getTime() + 30 * DAY_MS).toISOString(),
      recordedAt: now,
    });
    await updateOwnerSummary(transaction, firestore, 'client', uid, summary => {
      summary.attributionCount += 1;
    });
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_ATTRIBUTED', actorUid: uid, programId: referralCode.programId, code,
      inviterId: referralCode.ownerId, inviterOwnerType, createdAt: now,
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
      transaction.get(firestore.collection('bookings').where('clientId', '==', booking.clientId)),
    ]);
    const attribution = attributionSnapshot.data() as RecordValue | undefined;
    if (!attributionSnapshot.exists || !attribution || typeof attribution.programId !== 'string' || typeof attribution.code !== 'string') return false;
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
    if (!validProgram(program, countryCode, new Date(completionEvidence.updateTimeMs))) return false;
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
    if (eligibilityEvidenceSnapshot.exists && !qualificationMatchesRecord(existingEligibilityEvidence, qualification)) return false;
    if (attribution.inviterOwnerType === undefined) transaction.update(attributionRef, { inviterOwnerType });
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!eligibilityEvidenceSnapshot.exists) {
      transaction.create(eligibilityEvidenceRef, { ...qualification, createdAt: now });
    }
    transaction.create(rewardRef, {
      ...qualification,
      status: 'pending' as RewardStatus,
      createdAt: now,
      updatedAt: now,
    });
    await Promise.all([
      updateOwnerSummary(transaction, firestore, inviterOwnerType, attribution.inviterId as string, summary => {
        adjustOwnerSummaryRole(summary, 'inviter', 'pending', qualification.inviterCreditMinor, qualification.currency, 1);
      }),
      updateOwnerSummary(transaction, firestore, 'client', booking.clientId as string, summary => {
        adjustOwnerSummaryRole(summary, 'invitee', 'pending', qualification.invitedDiscountMinor, qualification.currency, 1);
      }),
      writeOwnerHistoryProjection(transaction, firestore, inviterOwnerType, attribution.inviterId as string, 'inviter', rewardRef.id),
      writeOwnerHistoryProjection(transaction, firestore, 'client', booking.clientId as string, 'invitee', rewardRef.id),
    ]);
    transaction.create(referralAuditRef, {
      action: 'REFERRAL_REWARD_PENDING', programId: attribution.programId, rewardId: rewardRef.id,
      code: attribution.code, inviterId: attribution.inviterId, inviterOwnerType, createdAt: now,
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
        transaction.get(firestore.collection('bookings').where('clientId', '==', linkage.invitedUserId)),
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
        || !eligibilityEvidenceSnapshot.exists || !eligibilityEvidence
        || !qualificationMatchesRecord(eligibilityEvidence, qualification)
        || !qualificationMatchesRecord(reward, qualification)
        || !attributionSnapshot.exists || !attribution || attribution.programId !== qualification.programId
        || attribution.code !== qualification.code || attribution.inviterId !== qualification.inviterId
        || timestampMs(attribution.expiresAt) === undefined
        || (timestampMs(attribution.expiresAt) as number) < qualification.eligibilityEvidenceUpdateTimeMs
        || (attribution.inviterOwnerType !== undefined && attribution.inviterOwnerType !== inviterOwnerType)
        || !programSnapshot.exists || !program
        || !validProgram(program, countryCode, new Date(qualification.eligibilityEvidenceUpdateTimeMs))
        || program.currency !== qualification.currency
        || program.inviterCreditMinor !== qualification.inviterCreditMinor
        || program.invitedDiscountMinor !== qualification.invitedDiscountMinor
        || programEvidence?.notBeforeAtMs !== qualification.eligibilityProgramNotBeforeAtMs
        || !codeSnapshot.exists || !code || code.code !== qualification.code || code.status !== 'active' || code.programId !== qualification.programId
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
    const canMoveExistingSummary = summaryQualification !== null && canonicalReferralRewardForOverview(rewardId, reward);
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
      await Promise.all([
        updateOwnerSummary(transaction, firestore, approvedReward.inviterOwnerType, approvedReward.inviterId, summary => {
          adjustOwnerSummaryRole(summary, 'inviter', 'pending', approvedReward.inviterCreditMinor, approvedReward.currency, -1);
          adjustOwnerSummaryRole(summary, 'inviter', 'approved', approvedReward.inviterCreditMinor, approvedReward.currency, 1);
        }),
        updateOwnerSummary(transaction, firestore, 'client', approvedReward.invitedUserId, summary => {
          adjustOwnerSummaryRole(summary, 'invitee', 'pending', approvedReward.invitedDiscountMinor, approvedReward.currency, -1);
          adjustOwnerSummaryRole(summary, 'invitee', 'approved', approvedReward.invitedDiscountMinor, approvedReward.currency, 1);
        }),
      ]);
    } else if (canMoveExistingSummary && summaryQualification) {
      await Promise.all([
        updateOwnerSummary(transaction, firestore, summaryQualification.inviterOwnerType, summaryQualification.inviterId, summary => {
          adjustOwnerSummaryRole(summary, 'inviter', 'pending', summaryQualification.inviterCreditMinor, summaryQualification.currency, -1);
          adjustOwnerSummaryRole(summary, 'inviter', status, summaryQualification.inviterCreditMinor, summaryQualification.currency, 1);
        }, false),
        updateOwnerSummary(transaction, firestore, 'client', summaryQualification.invitedUserId, summary => {
          adjustOwnerSummaryRole(summary, 'invitee', 'pending', summaryQualification.invitedDiscountMinor, summaryQualification.currency, -1);
          adjustOwnerSummaryRole(summary, 'invitee', status, summaryQualification.invitedDiscountMinor, summaryQualification.currency, 1);
        }, false),
      ]);
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
    const canUpdateSummary = summaryQualification !== null && canonicalReferralRewardForOverview(input.rewardId, reward);
    const wasFlagged = (reward.fraudFlag as RecordValue | undefined)?.status === 'flagged';
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
    if (canUpdateSummary && summaryQualification && wasFlagged !== input.flagged) {
      const delta: 1 | -1 = input.flagged ? 1 : -1;
      await Promise.all([
        updateOwnerSummary(transaction, firestore, summaryQualification.inviterOwnerType, summaryQualification.inviterId, summary => {
          const details = summary.inviter as RecordValue;
          details.flaggedPendingCount = Math.max(0, (details.flaggedPendingCount as number) + delta);
        }, false),
        updateOwnerSummary(transaction, firestore, 'client', summaryQualification.invitedUserId, summary => {
          const details = summary.invitee as RecordValue;
          details.flaggedPendingCount = Math.max(0, (details.flaggedPendingCount as number) + delta);
        }, false),
      ]);
    }
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
    && attribution?.programId === qualification.programId
    && attribution.code === qualification.code
    && attribution.inviterId === qualification.inviterId
    && attribution.inviterOwnerType === qualification.inviterOwnerType
    && timestampMs(attribution.expiresAt) !== undefined
    && (timestampMs(attribution.expiresAt) as number) >= qualification.eligibilityEvidenceUpdateTimeMs
    && code?.code === qualification.code
    && code?.programId === qualification.programId
    && code?.ownerId === qualification.inviterId
    && inviterOwnerType === qualification.inviterOwnerType
    && program !== undefined
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
    if (canonicalReferralRewardForOverview(snapshot.id, reward)) candidates.set(snapshot.id, reward);
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
    !attribution || typeof attribution.code !== 'string' || !CODE_PATTERN.test(attribution.code)
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
    !codeSnapshot.exists || !code || !programSnapshot.exists || !program
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

async function updateOwnerSummary(
  transaction: admin.firestore.Transaction,
  firestore: Firestore,
  ownerTypeValue: OwnerType,
  ownerId: string,
  update: (summary: ReferralOwnerSummaryRecord) => void,
  createIfMissing = true,
): Promise<void> {
  const ref = firestore.collection('referralOwnerSummaries').doc(ownerSummaryId(ownerTypeValue, ownerId));
  const existing = await transaction.get(ref);
  if (!existing.exists && !createIfMissing) return;
  const summary = writableOwnerSummary(existing.data() as RecordValue | undefined, ownerTypeValue, ownerId);
  if (!summary) error('failed-precondition', 'Referral owner summary is invalid');
  update(summary);
  transaction.set(ref, { ...summary, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
  details[countField] = Math.max(0, (details[countField] as number) + direction);
  if (status === 'pending' || status === 'approved') {
    const totals = details.creditTotalsByCurrency as RecordValue;
    const total = (totals[currency] as RecordValue | undefined) ?? { pendingMinor: 0, approvedMinor: 0 };
    const amountField = status === 'pending' ? 'pendingMinor' : 'approvedMinor';
    total[amountField] = Math.max(0, (total[amountField] as number) + direction * amountMinor);
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
    if (!CURRENCY_PATTERN.test(currency) || !total || typeof total !== 'object' || Array.isArray(total)) return [];
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
    .where('role', '==', input.role).orderBy('createdAt', 'desc');
  if (input.pageToken) {
    const cursor = await historyCollection.doc(input.pageToken).get();
    const cursorData = cursor.data() as RecordValue | undefined;
    if (!cursor.exists || cursorData?.ownerKey !== ownerSummaryId(ownerTypeValue, ownerId)
      || cursorData.ownerType !== ownerTypeValue || cursorData.ownerId !== ownerId || cursorData.role !== input.role) {
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
  return {
    contractVersion: 3,
    scope: input.scope,
    summary: safeWorkspaceSummary(summarySnapshot.data() as RecordValue | undefined, ownerTypeValue, ownerId),
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
    !codeSnapshot.exists || !referralCode || referralCode.status !== 'active'
    || (referralCode.ownerType !== 'client' && referralCode.ownerType !== 'freelancer' && referralCode.ownerType !== 'brand')
    || typeof referralCode.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.ownerId)
    || typeof referralCode.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.programId)
  ) error('not-found', 'Referral code is unavailable');
  const program = (await firestore.collection('referralPrograms').doc(referralCode.programId).get()).data() as RecordValue | undefined;
  if (!validProgram(program, countryCode, currentTime)) error('not-found', 'Referral code is unavailable');
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
      !codeSnapshot.exists || !referralCode || referralCode.status !== 'active'
      || (referralCode.ownerType !== 'client' && referralCode.ownerType !== 'freelancer' && referralCode.ownerType !== 'brand')
      || typeof referralCode.ownerId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.ownerId)
      || typeof referralCode.programId !== 'string' || !DOCUMENT_ID_PATTERN.test(referralCode.programId)
    ) error('not-found', 'Referral code is unavailable');
    const programRef = firestore.collection('referralPrograms').doc(referralCode.programId);
    const programSnapshot = await transaction.get(programRef);
    if (!validProgram(programSnapshot.data() as RecordValue | undefined, countryCode, currentTime)) {
      error('not-found', 'Referral code is unavailable');
    }
    const total = totalSnapshot.data()?.validatedVisitCount;
    if (total !== undefined && (!Number.isSafeInteger(total) || (total as number) < 0)) {
      error('failed-precondition', 'Referral telemetry is invalid');
    }
    const validatedVisitCount = (total as number | undefined) ?? 0;
    if (validatedVisitCount >= MAX_VALIDATED_VISITS_TOTAL) return false;
    const codeTelemetryRef = telemetry.doc(`${referralCode.programId}__${code}`);
    const codeTelemetrySnapshot = await transaction.get(codeTelemetryRef);
    const codeTotal = codeTelemetrySnapshot.data()?.validatedVisitCount;
    if (codeTotal !== undefined && (!Number.isSafeInteger(codeTotal) || (codeTotal as number) < 0)) {
      error('failed-precondition', 'Referral telemetry is invalid');
    }
    const codeValidatedVisitCount = (codeTotal as number | undefined) ?? 0;
    if (codeValidatedVisitCount >= MAX_VALIDATED_VISITS_PER_CODE) return false;
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(totalRef, {
      validatedVisitCount: validatedVisitCount + 1,
      updatedAt: now,
    });
    transaction.set(codeTelemetryRef, {
      code,
      programId: referralCode.programId,
      countryCode,
      validatedVisitCount: codeValidatedVisitCount + 1,
      updatedAt: now,
    });
    return true;
  });
  return { code, status: 'active', recorded };
}

function safeProgramForOverview(id: string, program: RecordValue): ReferralProgramOverview | null {
  if (
    (program.status !== 'draft' && program.status !== 'active' && program.status !== 'paused' && program.status !== 'archived')
    || !Array.isArray(program.countryCodes) || !program.countryCodes.every(country => typeof country === 'string')
    || typeof program.currency !== 'string' || !CURRENCY_PATTERN.test(program.currency)
    || !Number.isSafeInteger(program.inviterCreditMinor) || (program.inviterCreditMinor as number) < 0
    || !Number.isSafeInteger(program.invitedDiscountMinor) || (program.invitedDiscountMinor as number) < 0
    || timestampMs(program.startsAt) === undefined || timestampMs(program.endsAt) === undefined
  ) return null;
  return {
    id,
    status: program.status as ProgramStatus,
    countryCodes: program.countryCodes as string[],
    currency: program.currency as string,
    inviterCreditMinor: program.inviterCreditMinor as number,
    invitedDiscountMinor: program.invitedDiscountMinor as number,
    startsAt: timestampIso(program.startsAt) as string,
    endsAt: timestampIso(program.endsAt) as string,
  };
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

function approvedCreditTotalsForOverview(
  ledgers: CanonicalApprovedCreditLedger[],
): ReferralCreditTotal[] {
  const totals = new Map<string, number>();
  for (const ledger of ledgers) {
    totals.set(ledger.currency, (totals.get(ledger.currency) ?? 0) + ledger.amountMinor);
  }
  return [...totals.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((left, right) => String(left.currency).localeCompare(String(right.currency)));
}

function safeReferralAuditForOverview(id: string, event: RecordValue): ReferralAuditEntry | null {
  if (typeof event.action !== 'string' || !event.action.startsWith('REFERRAL_')) return null;
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
  const input = referralAuditQuery(value);
  const audit = firestore.collection('referralAudit');
  const auditSnapshotPromise = input.code ? audit.where('code', '==', input.code).limit(input.limit).get()
    : input.programId ? audit.where('programId', '==', input.programId).limit(input.limit).get()
      : input.rewardId ? audit.where('rewardId', '==', input.rewardId).limit(input.limit).get()
        : input.action ? audit.where('action', '==', input.action).limit(input.limit).get()
          : audit.orderBy('createdAt', 'desc').limit(input.limit).get();
  const [programsSnapshot, codesSnapshot, telemetrySnapshot, attributionsSnapshot, rewardsSnapshot, ledgersSnapshot, auditSnapshot] = await Promise.all([
    firestore.collection('referralPrograms').get(),
    firestore.collection('referralCodes').get(),
    firestore.collection('referralTelemetry').doc('overview').get(),
    firestore.collection('referralAttributions').get(),
    firestore.collection('referralRewards').get(),
    firestore.collection('creditLedgers').get(),
    auditSnapshotPromise,
  ]);
  const programs = programsSnapshot.docs.flatMap(program => {
    const data = program.data() as RecordValue;
    const safeProgram = safeProgramForOverview(program.id, data);
    return safeProgram ? [safeProgram] : [];
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const attributionsByInviter = new Map<string, { inviterId: string; inviterOwnerType: OwnerType; referrals: number }>();
  for (const attributionSnapshot of attributionsSnapshot.docs) {
    const attribution = attributionSnapshot.data() as RecordValue;
    const inviterOwnerType = ownerType(attribution.inviterOwnerType);
    if (typeof attribution.inviterId !== 'string' || !inviterOwnerType) continue;
    const key = principalKey(attribution.inviterId, inviterOwnerType);
    const current = attributionsByInviter.get(key);
    attributionsByInviter.set(key, {
      inviterId: attribution.inviterId,
      inviterOwnerType,
      referrals: (current?.referrals ?? 0) + 1,
    });
  }

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  const pendingRewards: ReferralPendingRewardOverview[] = [];
  const flaggedRewards: Array<ReferralPendingRewardOverview & { fraudFlag: { status: 'flagged'; reason: string } }> = [];
  const canonicalRewards = rewardsSnapshot.docs.flatMap(snapshot => {
    const reward = snapshot.data() as RecordValue;
    return canonicalReferralRewardForOverview(snapshot.id, reward) ? [{ id: snapshot.id, reward }] : [];
  });
  const rewardsById = new Map<string, RecordValue>(canonicalRewards.map(({ id, reward }) => [id, reward]));
  const referrerTotals = new Map<string, {
    inviterId: string; inviterOwnerType: OwnerType; rewards: number; approvedCredits: Map<string, number>;
  }>();
  for (const { id: rewardId, reward } of canonicalRewards) {
    if (reward.status === 'pending') pending += 1;
    else if (reward.status === 'approved') approved += 1;
    else if (reward.status === 'rejected') rejected += 1;
    const pendingReward = safePendingRewardForOverview(rewardId, reward);
    if (pendingReward) {
      pendingRewards.push(pendingReward);
      const fraudFlag = pendingReward.fraudFlag;
      if (fraudFlag?.status === 'flagged') {
        flaggedRewards.push({ ...pendingReward, fraudFlag: { status: 'flagged', reason: fraudFlag.reason } });
      }
    }
    const inviterOwnerType = ownerType(reward.inviterOwnerType);
    if (
      typeof reward.inviterId !== 'string' || !inviterOwnerType
      || typeof reward.currency !== 'string' || !CURRENCY_PATTERN.test(reward.currency)
    ) continue;
    const key = principalKey(reward.inviterId, inviterOwnerType);
    const current = referrerTotals.get(key) ?? {
      inviterId: reward.inviterId, inviterOwnerType, rewards: 0, approvedCredits: new Map<string, number>(),
    };
    current.rewards += 1;
    referrerTotals.set(key, current);
  }
  const canonicalApprovedCreditLedgers = ledgersSnapshot.docs.flatMap(snapshot => {
    const ledger = canonicalApprovedCreditLedgerForOverview(
      snapshot as { id: string; data(): RecordValue }, rewardsById,
    );
    return ledger ? [ledger] : [];
  });
  for (const ledger of canonicalApprovedCreditLedgers) {
    if (ledger.kind !== 'referral_inviter_credit') continue;
    const key = principalKey(ledger.ownerId, ledger.ownerType);
    const current = referrerTotals.get(key) ?? {
      inviterId: ledger.ownerId, inviterOwnerType: ledger.ownerType, rewards: 0, approvedCredits: new Map<string, number>(),
    };
    current.approvedCredits.set(
      ledger.currency,
      (current.approvedCredits.get(ledger.currency) ?? 0) + ledger.amountMinor,
    );
    referrerTotals.set(key, current);
  }
  const topReferrers = new Map<string, ReferralTopReferrer>();
  for (const [key, attribution] of attributionsByInviter) {
    const total = referrerTotals.get(key);
    topReferrers.set(key, {
      inviterId: attribution.inviterId,
      inviterOwnerType: attribution.inviterOwnerType,
      referrals: attribution.referrals,
      rewards: total?.rewards ?? 0,
      approvedCreditTotals: total ? [...total.approvedCredits.entries()]
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((left, right) => left.currency.localeCompare(right.currency)) : [],
    });
  }
  for (const [key, total] of referrerTotals) {
    if (topReferrers.has(key)) continue;
    topReferrers.set(key, {
      inviterId: total.inviterId,
      inviterOwnerType: total.inviterOwnerType,
      referrals: 0,
      rewards: total.rewards,
      approvedCreditTotals: [...total.approvedCredits.entries()]
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
    });
  }
  const auditTrail = auditSnapshot.docs
    .flatMap(snapshot => {
      const audit = safeReferralAuditForOverview(snapshot.id, snapshot.data() as RecordValue);
      return audit ? [audit] : [];
    });
  const telemetry = telemetrySnapshot.data() as RecordValue | undefined;
  const validatedVisits = Number.isSafeInteger(telemetry?.validatedVisitCount)
    && (telemetry?.validatedVisitCount as number) >= 0
    ? telemetry?.validatedVisitCount as number
    : 0;

  return {
    contractVersion: 2,
    programs,
    funnel: {
      codes: codesSnapshot.docs.length,
      validatedVisits,
      attributions: attributionsSnapshot.docs.length,
      attributedSignups: attributionsSnapshot.docs.length,
      rewards: canonicalRewards.length,
      eligibleFirstBookings: canonicalRewards.length,
      pending,
      pendingRewards: pending,
      approved,
      approvedRewards: approved,
      rejected,
    },
    approvedCreditTotals: approvedCreditTotalsForOverview(canonicalApprovedCreditLedgers),
    topReferrers: [...topReferrers.values()]
      .sort((left, right) => right.referrals - left.referrals || right.rewards - left.rewards
        || left.inviterOwnerType.localeCompare(right.inviterOwnerType) || left.inviterId.localeCompare(right.inviterId))
      .slice(0, 10),
    pendingRewards: pendingRewards.sort((left, right) => (
      (timestampMs(right.createdAt) ?? 0) - (timestampMs(left.createdAt) ?? 0) || String(left.id).localeCompare(String(right.id))
    )),
    flaggedRewards: flaggedRewards.sort((left, right) => (
      (timestampMs(right.createdAt) ?? 0) - (timestampMs(left.createdAt) ?? 0) || String(left.id).localeCompare(String(right.id))
    )),
    auditTrail,
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
