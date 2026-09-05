import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';
type DepositMode = 'none' | 'fixed' | 'percentage';

export interface FreelancerProfileInput {
  displayName: string;
  bio: string;
  cityId: CityId;
  languages: string[];
  serviceSummary: string;
  serviceIds: string[];
  visible: boolean;
  radiusKm: number;
  travelFeeMinor: number;
  deposit: { mode: DepositMode; value: number };
  cancellationWindowHours: number;
  availability: string[];
}

const PROFILE_KEYS = new Set([
  'displayName', 'bio', 'cityId', 'languages', 'serviceSummary', 'serviceIds',
  'visible', 'radiusKm', 'travelFeeMinor', 'deposit', 'cancellationWindowHours',
  'availability',
]);
const PORTFOLIO_KEYS = new Set(['imageUrl', 'caption', 'visible']);
const CITY_COORDINATES: Record<CityId, { latitude: number; longitude: number; countryCode: 'FR' }> = {
  'fr-paris': { latitude: 48.85, longitude: 2.35, countryCode: 'FR' },
  'fr-grenoble': { latitude: 45.18, longitude: 5.72, countryCode: 'FR' },
  'fr-mulhouse': { latitude: 47.75, longitude: 7.33, countryCode: 'FR' },
};
export const MAX_APPROVED_PORTFOLIO_ITEMS = 12;

function inputRecord(value: unknown, keys: Set<string>, message: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', message);
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !keys.has(key))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Server-owned freelancer fields cannot be supplied by the client',
    );
  }
  return input;
}

function text(value: unknown, field: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return normalized;
}

function stringList(value: unknown, field: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  const normalized = value.map(item => text(item, field, maximumLength));
  if (new Set(normalized).size !== normalized.length) {
    throw new functions.https.HttpsError('invalid-argument', `${field} contains duplicates`);
  }
  return normalized;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return value as number;
}

function availabilityList(value: unknown): string[] {
  const slots = stringList(value, 'availability', 100, 16);
  if (slots.some(slot => !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(slot))) {
    throw new functions.https.HttpsError('invalid-argument', 'availability is invalid');
  }
  return slots.sort();
}

function depositPreference(value: unknown): FreelancerProfileInput['deposit'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'deposit is invalid');
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !['mode', 'value'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'deposit is invalid');
  }
  if (input.mode !== 'none' && input.mode !== 'fixed' && input.mode !== 'percentage') {
    throw new functions.https.HttpsError('invalid-argument', 'deposit.mode is invalid');
  }
  const maximum = input.mode === 'percentage' ? 100 : 1_000_000;
  const amount = integer(input.value, 'deposit.value', 0, maximum);
  if (input.mode === 'none' && amount !== 0) {
    throw new functions.https.HttpsError('invalid-argument', 'A disabled deposit must have value zero');
  }
  return { mode: input.mode, value: amount };
}

export function parseFreelancerProfileInput(value: unknown): FreelancerProfileInput {
  const input = inputRecord(value, PROFILE_KEYS, 'Freelancer profile is required');
  if (typeof input.cityId !== 'string' || !(input.cityId in CITY_COORDINATES)) {
    throw new functions.https.HttpsError('invalid-argument', 'cityId is invalid');
  }
  if (typeof input.visible !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'visible is invalid');
  }
  return {
    displayName: text(input.displayName, 'displayName', 120),
    bio: text(input.bio, 'bio', 1000, true),
    cityId: input.cityId as CityId,
    languages: stringList(input.languages, 'languages', 12, 40),
    serviceSummary: text(input.serviceSummary, 'serviceSummary', 500),
    serviceIds: stringList(input.serviceIds, 'serviceIds', 24, 128),
    visible: input.visible,
    radiusKm: integer(input.radiusKm, 'radiusKm', 1, 100),
    travelFeeMinor: integer(input.travelFeeMinor, 'travelFeeMinor', 0, 1_000_000),
    deposit: depositPreference(input.deposit),
    cancellationWindowHours: integer(
      input.cancellationWindowHours,
      'cancellationWindowHours',
      0,
      720,
    ),
    availability: availabilityList(input.availability),
  };
}

function approvedPortfolioQuery(uid: string, firestore: Firestore): admin.firestore.Query {
  return firestore.collection('portfolioItems').where('ownerId', '==', uid);
}

function approvedPortfolioUrls(items: admin.firestore.QuerySnapshot): string[] {
  return [...items.docs]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => item.data() as RecordValue)
    .filter(item => (
      item.ownerType === 'freelancer'
      && item.moderationStatus === 'approved'
      && item.visible === true
      && typeof item.imageUrl === 'string'
      && /^https:\/\//i.test(item.imageUrl)
    ))
    .map(item => item.imageUrl as string)
    .slice(0, MAX_APPROVED_PORTFOLIO_ITEMS);
}

export async function refreshFreelancerPortfolioProjection(
  uid: string,
  firestore: Firestore = admin.firestore(),
): Promise<void> {
  const profileRef = firestore.collection('freelancerProfiles').doc(uid);
  await firestore.runTransaction(async transaction => {
    const [profileSnapshot, portfolioSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(approvedPortfolioQuery(uid, firestore)),
    ]);
    const profile = profileSnapshot.data() as RecordValue | undefined;
    if (!profileSnapshot.exists || !profile) return;
    const currentPublicProfile = profile.publicProfile as RecordValue | undefined;
    transaction.update(profileRef, {
      publicProfile: {
        ...(currentPublicProfile ?? {}),
        portfolioUrls: approvedPortfolioUrls(portfolioSnapshot),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function saveFreelancerProfile(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ uid: string }> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parseFreelancerProfileInput(value);
  const profileRef = firestore.collection('freelancerProfiles').doc(callerUid);
  const availabilityRef = firestore.collection('availability').doc(callerUid);
  const auditRef = firestore.collection('auditEvents').doc();

  await firestore.runTransaction(async transaction => {
    const [existingSnapshot, portfolioSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(approvedPortfolioQuery(callerUid, firestore)),
    ]);
    const existing = existingSnapshot.data() as RecordValue | undefined;
    const currentPublicProfile = existing?.publicProfile as RecordValue | undefined;
    const approvalStatus = currentPublicProfile?.approvalStatus === 'approved'
      ? 'approved'
      : 'pending';
    const coordinates = CITY_COORDINATES[input.cityId];
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(profileRef, {
      uid: callerUid,
      ...input,
      countryCode: coordinates.countryCode,
      publicProfile: {
        approvalStatus,
        visible: input.visible,
        cityId: input.cityId,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        serviceSummary: input.serviceSummary,
        portfolioUrls: approvedPortfolioUrls(portfolioSnapshot),
        serviceIds: input.serviceIds,
        homeVisit: true,
      },
      ...(existing?.verificationStatus ? { verificationStatus: existing.verificationStatus } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    transaction.set(availabilityRef, {
      ownerId: callerUid,
      ownerType: 'freelancer',
      availableSlots: input.availability,
      updatedAt: now,
    });
    transaction.create(auditRef, {
      action: 'FREELANCER_PROFILE_SAVED', actorUid: callerUid, freelancerId: callerUid,
      visible: input.visible, cityId: input.cityId, createdAt: now,
    });
  });
  return { uid: callerUid };
}

function portfolioUrl(value: unknown): string {
  const url = text(value, 'imageUrl', 2048);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new functions.https.HttpsError('invalid-argument', 'imageUrl must be an HTTPS URL');
  }
  return url;
}

export async function createFreelancerPortfolioItem(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ portfolioItemId: string }> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = inputRecord(value, PORTFOLIO_KEYS, 'Portfolio item is required');
  if (typeof input.visible !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'visible is invalid');
  }
  const itemRef = firestore.collection('portfolioItems').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await itemRef.set({
    ownerId: callerUid,
    ownerType: 'freelancer',
    imageUrl: portfolioUrl(input.imageUrl),
    caption: text(input.caption, 'caption', 240, true),
    visible: input.visible,
    moderationStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return { portfolioItemId: itemRef.id };
}

export async function deleteFreelancerPortfolioItem(
  callerUid: string | null,
  portfolioItemId: string,
  firestore: Firestore = admin.firestore(),
): Promise<{ portfolioItemId: string }> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(portfolioItemId)) {
    throw new functions.https.HttpsError('invalid-argument', 'portfolioItemId is invalid');
  }
  const itemRef = firestore.collection('portfolioItems').doc(portfolioItemId);
  await firestore.runTransaction(async transaction => {
    const item = await transaction.get(itemRef);
    if (!item.exists) throw new functions.https.HttpsError('not-found', 'Portfolio item not found');
    if (item.data()?.ownerId !== callerUid || item.data()?.ownerType !== 'freelancer') {
      throw new functions.https.HttpsError('permission-denied', 'Portfolio item belongs to another freelancer');
    }
    transaction.delete(itemRef);
  });
  return { portfolioItemId };
}

export const saveFreelancerProfileFunction = functions.https.onCall((data, context) => (
  saveFreelancerProfile(context.auth?.uid ?? null, data)
));

export const createFreelancerPortfolioItemFunction = functions.https.onCall((data, context) => (
  createFreelancerPortfolioItem(context.auth?.uid ?? null, data)
));

export const deleteFreelancerPortfolioItemFunction = functions.https.onCall((data, context) => {
  const input = inputRecord(data, new Set(['portfolioItemId']), 'portfolioItemId is required');
  return deleteFreelancerPortfolioItem(
    context.auth?.uid ?? null,
    text(input.portfolioItemId, 'portfolioItemId', 256),
  );
});

export const syncFreelancerPortfolio = functions.firestore
  .document('portfolioItems/{portfolioItemId}')
  .onWrite(async change => {
    const owners = new Set<string>();
    const before = change.before.exists ? change.before.data() : undefined;
    const after = change.after.exists ? change.after.data() : undefined;
    if (before?.ownerType === 'freelancer' && typeof before.ownerId === 'string') {
      owners.add(before.ownerId);
    }
    if (after?.ownerType === 'freelancer' && typeof after.ownerId === 'string') {
      owners.add(after.ownerId);
    }
    await Promise.all([...owners].map(uid => refreshFreelancerPortfolioProjection(uid)));
  });
