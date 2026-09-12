import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type RewardStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
type ProgramStatus = 'draft' | 'active' | 'paused' | 'archived';
type OwnerType = 'client' | 'freelancer' | 'brand';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PROGRAM_STATE_ID = 'active';

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
  });
  return { code };
}

export async function attributeReferral(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ attributed: true; programId: string }> {
  const uid = callerUid(caller);
  const input = record(value, ['code', 'countryCode'], 'Referral attribution is invalid');
  const code = normalizeReferralCode(input.code);
  const countryCode = input.countryCode === undefined ? 'FR' : isoCountry(input.countryCode, 'countryCode');
  const attributionRef = firestore.collection('referralAttributions').doc(uid);
  const codeRef = firestore.collection('referralCodes').doc(code);
  await firestore.runTransaction(async transaction => {
    const [existing, codeSnapshot] = await Promise.all([transaction.get(attributionRef), transaction.get(codeRef)]);
    if (existing.exists) error('already-exists', 'Referral attribution is immutable');
    const referralCode = codeSnapshot.data() as RecordValue | undefined;
    if (!codeSnapshot.exists || !referralCode || referralCode.status !== 'active') {
      error('not-found', 'Referral code is unavailable');
    }
    if (referralCode.ownerId === uid) error('permission-denied', 'You cannot use your own referral code');
    if (typeof referralCode.programId !== 'string') error('failed-precondition', 'Referral code is invalid');
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
      countryCode,
      expiresAt: new Date(currentTime.getTime() + 30 * DAY_MS).toISOString(),
      recordedAt: now,
    });
  });
  const codeSnapshot = await codeRef.get();
  return { attributed: true, programId: String(codeSnapshot.data()?.programId) };
}

export async function processReferralBookingCompletion(
  bookingId: string,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ created: boolean }> {
  if (!DOCUMENT_ID_PATTERN.test(bookingId)) error('invalid-argument', 'bookingId is invalid');
  const bookingRef = firestore.collection('bookings').doc(bookingId);
  const created = await firestore.runTransaction(async transaction => {
    const bookingSnapshot = await transaction.get(bookingRef);
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !booking || booking.status !== 'completed' || booking.isTest === true) return false;
    if (typeof booking.clientId !== 'string' || !DOCUMENT_ID_PATTERN.test(booking.clientId)) return false;
    const attributionRef = firestore.collection('referralAttributions').doc(booking.clientId);
    const [attributionSnapshot, completedBookings] = await Promise.all([
      transaction.get(attributionRef),
      transaction.get(firestore.collection('bookings').where('clientId', '==', booking.clientId)),
    ]);
    const attribution = attributionSnapshot.data() as RecordValue | undefined;
    if (!attributionSnapshot.exists || !attribution || typeof attribution.programId !== 'string' || typeof attribution.code !== 'string') return false;
    if (timestampMs(attribution.expiresAt) === undefined || (timestampMs(attribution.expiresAt) as number) < currentTime.getTime()) return false;
    const eligibleBookings = completedBookings.docs.filter(candidate => {
      const candidateValue = candidate.data() as RecordValue;
      return candidateValue.status === 'completed' && candidateValue.isTest !== true;
    });
    if (eligibleBookings.length !== 1 || eligibleBookings[0].id !== bookingId) return false;
    const programRef = firestore.collection('referralPrograms').doc(attribution.programId);
    const codeRef = firestore.collection('referralCodes').doc(attribution.code);
    const rewardRef = firestore.collection('referralRewards').doc(`${attribution.programId}__${booking.clientId}`);
    const [programSnapshot, codeSnapshot, rewardSnapshot] = await Promise.all([
      transaction.get(programRef), transaction.get(codeRef), transaction.get(rewardRef),
    ]);
    if (rewardSnapshot.exists) return false;
    const program = programSnapshot.data() as RecordValue | undefined;
    const code = codeSnapshot.data() as RecordValue | undefined;
    const countryCode = typeof attribution.countryCode === 'string' ? attribution.countryCode : 'FR';
    if (!validProgram(program, countryCode, currentTime)) return false;
    if (
      !codeSnapshot.exists || !code || code.status !== 'active' || code.programId !== attribution.programId
      || code.ownerId !== attribution.inviterId || typeof attribution.inviterId !== 'string'
      || attribution.inviterId === booking.clientId
    ) return false;
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(rewardRef, {
      programId: attribution.programId,
      bookingId,
      code: attribution.code,
      inviterId: attribution.inviterId,
      invitedUserId: booking.clientId,
      inviterCreditMinor: program?.inviterCreditMinor,
      invitedDiscountMinor: program?.invitedDiscountMinor,
      currency: program?.currency,
      status: 'pending' as RewardStatus,
      createdAt: now,
      updatedAt: now,
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
  await firestore.runTransaction(async transaction => {
    const rewardSnapshot = await transaction.get(rewardRef);
    const reward = rewardSnapshot.data() as RecordValue | undefined;
    if (!rewardSnapshot.exists || !reward) error('not-found', 'Referral reward not found');
    if (reward.status !== 'pending') error('failed-precondition', 'Referral reward is no longer pending review');
    if (
      typeof reward.inviterId !== 'string' || typeof reward.invitedUserId !== 'string'
      || typeof reward.currency !== 'string' || !CURRENCY_PATTERN.test(reward.currency)
      || !Number.isSafeInteger(reward.inviterCreditMinor) || (reward.inviterCreditMinor as number) < 0
      || !Number.isSafeInteger(reward.invitedDiscountMinor) || (reward.invitedDiscountMinor as number) < 0
    ) error('failed-precondition', 'Referral reward is invalid');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(rewardRef, {
      status, reviewedBy: uid, reviewedAt: now, updatedAt: now,
      ...(reason ? { reviewReason: reason } : {}),
    });
    if (status === 'approved') {
      const inviterLedger = firestore.collection('creditLedgers').doc(`${rewardId}__inviter`);
      const invitedLedger = firestore.collection('creditLedgers').doc(`${rewardId}__invited`);
      transaction.create(inviterLedger, {
        rewardId, ownerId: reward.inviterId, amountMinor: reward.inviterCreditMinor,
        currency: reward.currency, kind: 'referral_inviter_credit', status: 'approved', createdAt: now,
      });
      transaction.create(invitedLedger, {
        rewardId, ownerId: reward.invitedUserId, amountMinor: reward.invitedDiscountMinor,
        currency: reward.currency, kind: 'referral_invited_discount', status: 'approved', createdAt: now,
      });
    }
    transaction.create(auditRef, {
      action: `REFERRAL_REWARD_${status.toUpperCase()}`,
      actorUid: uid, rewardId, programId: reward.programId, createdAt: now,
    });
  });
  return { rewardId, status };
}

export async function getMyReferralWorkspace(
  caller: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<RecordValue> {
  const uid = callerUid(caller);
  record(value, [], 'Referral workspace scope is derived from the authenticated account');
  const [codes, attributionSnapshot, inviterRewards, invitedRewards] = await Promise.all([
    firestore.collection('referralCodes').where('ownerId', '==', uid).get(),
    firestore.collection('referralAttributions').doc(uid).get(),
    firestore.collection('referralRewards').where('inviterId', '==', uid).get(),
    firestore.collection('referralRewards').where('invitedUserId', '==', uid).get(),
  ]);
  const safeCodes = codes.docs.flatMap(code => {
    const value = code.data() as RecordValue;
    return typeof value.code === 'string' && typeof value.ownerType === 'string'
      && typeof value.programId === 'string' && typeof value.status === 'string'
      ? [{ code: value.code, ownerType: value.ownerType, programId: value.programId, status: value.status }]
      : [];
  }).sort((left, right) => left.code.localeCompare(right.code));
  const attribution = attributionSnapshot.data() as RecordValue | undefined;
  const safeAttribution = attribution && typeof attribution.code === 'string' && typeof attribution.programId === 'string'
    && attribution.expiresAt !== undefined
    ? { code: attribution.code, programId: attribution.programId, expiresAt: attribution.expiresAt }
    : undefined;
  const rewardById = new Map<string, RecordValue>();
  for (const snapshot of inviterRewards.docs) rewardById.set(snapshot.id, snapshot.data() as RecordValue);
  for (const snapshot of invitedRewards.docs) rewardById.set(snapshot.id, snapshot.data() as RecordValue);
  const rewards = [...rewardById.entries()].flatMap(([id, reward]) => {
    const inviter = reward.inviterId === uid;
    const invited = reward.invitedUserId === uid;
    const amountMinor = inviter ? reward.inviterCreditMinor : invited ? reward.invitedDiscountMinor : undefined;
    return typeof amountMinor === 'number' && typeof reward.currency === 'string' && typeof reward.status === 'string'
      ? [{ id, role: inviter ? 'inviter' : 'invited', amountMinor, currency: reward.currency, status: reward.status }]
      : [];
  }).sort((left, right) => left.id.localeCompare(right.id));
  return { codes: safeCodes, ...(safeAttribution ? { attribution: safeAttribution } : {}), rewards };
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

export const reserveReferralCodeFunction = functions.https.onCall((data, context) => (
  reserveReferralCode(context.auth?.uid ?? null, data)
));

export const attributeReferralFunction = functions.https.onCall((data, context) => (
  attributeReferral(context.auth?.uid ?? null, data)
));

export const reviewReferralRewardFunction = functions.https.onCall((data, context) => (
  reviewReferralReward(requirePlatformAdminContext(context), data, admin.firestore(), true)
));

export const getMyReferralWorkspaceFunction = functions.https.onCall((data, context) => (
  getMyReferralWorkspace(context.auth?.uid ?? null, data)
));
