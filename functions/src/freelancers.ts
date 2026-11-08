import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { europeFunctions } from './runtime';
import { freeSlot, intervalsFromBookings, minimumServiceDuration, storedIntervals } from './freelancerAvailability';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';
type DepositMode = 'none' | 'fixed' | 'percentage';
type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'website' | 'whatsapp';
export type AppointmentMode = 'home' | 'chair';
export type FreelancerWorkModes = Record<AppointmentMode, boolean>;
export interface FreelancerWorkplace {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
}
export type SocialLinks = Partial<Record<SocialPlatform, string>>;
export interface FreelancerIdentity {
  profileImageUrl?: string;
  socialLinks: SocialLinks;
  publicSlug: string;
}

export interface FreelancerProfileInput {
  displayName: string;
  bio: string;
  cityId: CityId;
  languages: string[];
  serviceSummary: string;
  serviceIds: string[];
  servicePricesMinor: Record<string, number>;
  serviceDurationMinutes: Record<string, number>;
  workModes: FreelancerWorkModes;
  availabilityByMode: Record<AppointmentMode, string[]>;
  workplace?: FreelancerWorkplace;
  visible: boolean;
  radiusKm: number;
  travelFeeMinor: number;
  deposit: { mode: DepositMode; value: number };
  cancellationWindowHours: number;
  availability: string[];
  identity: FreelancerIdentity;
}

const PROFILE_KEYS = new Set([
  'displayName', 'bio', 'cityId', 'languages', 'serviceSummary', 'serviceIds',
  'servicePricesMinor', 'serviceDurationMinutes', 'workModes', 'availabilityByMode', 'workplace',
  'visible', 'radiusKm', 'travelFeeMinor', 'deposit', 'cancellationWindowHours',
  'availability', 'identity',
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

function validSlot(slot: unknown): slot is string {
  if (typeof slot !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(slot)) return false;
  const date = new Date(`${slot}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === slot;
}

function availabilityList(value: unknown, field = 'availability'): string[] {
  const slots = stringList(value, field, 100, 16);
  if (slots.some(slot => !validSlot(slot))) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return slots.sort();
}

function servicePrices(value: unknown, serviceIds: string[]): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'servicePricesMinor is invalid');
  }
  const prices = value as RecordValue;
  const priceIds = Object.keys(prices);
  if (
    priceIds.length !== serviceIds.length
    || priceIds.some(serviceId => !serviceIds.includes(serviceId))
  ) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'servicePricesMinor must contain exactly one price for each service',
    );
  }
  return Object.fromEntries(serviceIds.map(serviceId => [
    serviceId,
    integer(prices[serviceId], `servicePricesMinor.${serviceId}`, 0, 1_000_000),
  ]));
}

function serviceDurations(value: unknown, serviceIds: string[]): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceDurationMinutes is invalid');
  }
  const durations = value as RecordValue;
  const durationIds = Object.keys(durations);
  if (durationIds.length !== serviceIds.length || durationIds.some(id => !serviceIds.includes(id))) {
    throw new functions.https.HttpsError(
      'invalid-argument', 'serviceDurationMinutes must contain exactly one duration for each service',
    );
  }
  return Object.fromEntries(serviceIds.map(id => [
    id, integer(durations[id], `serviceDurationMinutes.${id}`, 15, 360),
  ]));
}

function workModes(value: unknown): FreelancerWorkModes {
  const modes = inputRecord(value, new Set(['home', 'chair']), 'workModes is invalid');
  if (typeof modes.home !== 'boolean' || typeof modes.chair !== 'boolean' || (!modes.home && !modes.chair)) {
    throw new functions.https.HttpsError('invalid-argument', 'workModes requires at least one active mode');
  }
  return { home: modes.home, chair: modes.chair };
}

function modeAvailability(value: unknown): Record<AppointmentMode, string[]> {
  const input = inputRecord(value, new Set(['home', 'chair']), 'availabilityByMode is invalid');
  const home = availabilityList(input.home, 'availabilityByMode.home');
  const chair = availabilityList(input.chair, 'availabilityByMode.chair');
  if (home.some(slot => chair.includes(slot))) {
    throw new functions.https.HttpsError('invalid-argument', 'availabilityByMode contains duplicate slots');
  }
  return { home, chair };
}

function workplace(value: unknown): FreelancerWorkplace {
  const place = inputRecord(value, new Set(['name', 'line1', 'postalCode', 'city']), 'workplace is invalid');
  return {
    name: text(place.name, 'workplace.name', 160),
    line1: text(place.line1, 'workplace.line1', 240),
    postalCode: text(place.postalCode, 'workplace.postalCode', 20),
    city: text(place.city, 'workplace.city', 120),
  };
}

function storedSlots(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(validSlot) : [];
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

const SOCIAL_LINK_KEYS = new Set<SocialPlatform>([
  'instagram', 'tiktok', 'facebook', 'website', 'whatsapp',
]);
const SOCIAL_HOSTS: Partial<Record<SocialPlatform, Set<string>>> = {
  instagram: new Set(['instagram.com', 'www.instagram.com']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com']),
  facebook: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
};

export function normalizePublicSlug(value: string): string {
  const slug = value.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new functions.https.HttpsError('invalid-argument', 'publicSlug is invalid');
  }
  return slug;
}

function socialUrl(value: unknown, field: string, hosts?: Set<string>): string {
  const url = text(value, field, 2048);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || (hosts && !hosts.has(parsed.hostname))) {
      throw new Error('invalid');
    }
    return parsed.toString();
  } catch {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
}

export function sanitizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'socialLinks is invalid');
  }
  const socialLinks = value as RecordValue;
  if (Object.keys(socialLinks).some(key => !SOCIAL_LINK_KEYS.has(key as SocialPlatform))) {
    throw new functions.https.HttpsError('invalid-argument', 'socialLinks is invalid');
  }
  return Object.fromEntries(Object.entries(socialLinks).map(([key, link]) => {
    if (key === 'whatsapp') {
      if (typeof link !== 'string' || !/^\+[1-9]\d{7,14}$/.test(link)) {
        throw new functions.https.HttpsError('invalid-argument', 'socialLinks.whatsapp is invalid');
      }
      return [key, link];
    }
    return [key, socialUrl(link, `socialLinks.${key}`, SOCIAL_HOSTS[key as SocialPlatform])];
  })) as SocialLinks;
}

function freelancerIdentity(value: unknown, allowEmptySlug: boolean): FreelancerIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'identity is invalid');
  }
  const identity = value as RecordValue;
  if (Object.keys(identity).some(key => !['profileImageUrl', 'socialLinks', 'publicSlug'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'identity is invalid');
  }
  if (typeof identity.publicSlug !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'publicSlug is invalid');
  }
  return {
    ...(identity.profileImageUrl === undefined
      ? {}
      : { profileImageUrl: socialUrl(identity.profileImageUrl, 'profileImageUrl') }),
    socialLinks: sanitizeSocialLinks(identity.socialLinks),
    publicSlug: allowEmptySlug && identity.publicSlug.trim() === '' ? '' : normalizePublicSlug(identity.publicSlug),
  };
}

export function parseFreelancerProfileInput(value: unknown): FreelancerProfileInput {
  const input = inputRecord(value, PROFILE_KEYS, 'Freelancer profile is required');
  if (typeof input.cityId !== 'string' || !(input.cityId in CITY_COORDINATES)) {
    throw new functions.https.HttpsError('invalid-argument', 'cityId is invalid');
  }
  if (typeof input.visible !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'visible is invalid');
  }
  const serviceIds = stringList(input.serviceIds, 'serviceIds', 24, 128);
  const modes = workModes(input.workModes);
  const slots = modeAvailability(input.availabilityByMode);
  const place = input.workplace === undefined && !modes.chair ? undefined : workplace(input.workplace);
  if (input.visible && serviceIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'A visible profile requires at least one service');
  }
  if (input.visible && ((modes.home && slots.home.length === 0) || (modes.chair && slots.chair.length === 0))) {
    throw new functions.https.HttpsError('invalid-argument', 'availability is required for every enabled mode');
  }
  return {
    displayName: text(input.displayName, 'displayName', 120),
    bio: text(input.bio, 'bio', 1000, true),
    cityId: input.cityId as CityId,
    languages: stringList(input.languages, 'languages', 12, 40),
    serviceSummary: text(input.serviceSummary, 'serviceSummary', 500, !input.visible),
    serviceIds,
    servicePricesMinor: servicePrices(input.servicePricesMinor, serviceIds),
    serviceDurationMinutes: serviceDurations(input.serviceDurationMinutes, serviceIds),
    workModes: modes,
    availabilityByMode: slots,
    ...(place ? { workplace: place } : {}),
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
    // The mode lists are authoritative; keep the legacy home-only contract.
    availability: slots.home,
    identity: freelancerIdentity(input.identity, !input.visible),
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
  const profileId = `freelancer__${callerUid}`;
  const slugRef = input.identity.publicSlug
    ? firestore.collection('publicProfileSlugs').doc(input.identity.publicSlug)
    : null;

  await firestore.runTransaction(async transaction => {
    const [existingSnapshot, availabilitySnapshot, portfolioSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(availabilityRef),
      transaction.get(approvedPortfolioQuery(callerUid, firestore)),
    ]);
    const existing = existingSnapshot.data() as RecordValue | undefined;
    const existingAvailability = availabilitySnapshot.data() as RecordValue | undefined;
    const oldSlug = (existing?.identity as RecordValue | undefined)?.publicSlug;
    const oldSlugRef = typeof oldSlug === 'string'
      && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(oldSlug)
      && oldSlug !== input.identity.publicSlug
      ? firestore.collection('publicProfileSlugs').doc(oldSlug)
      : null;
    // Slug ownership participates in the same transaction as the profile and
    // availability. All index reads must happen before any writes.
    const [slugSnapshot, oldSlugSnapshot] = await Promise.all([
      slugRef ? transaction.get(slugRef) : null,
      oldSlugRef ? transaction.get(oldSlugRef) : null,
    ]);
    if (slugSnapshot?.exists && slugSnapshot.data()?.profileId !== profileId) {
      throw new functions.https.HttpsError('already-exists', 'publicSlug is already used');
    }
    const currentlyAvailable = new Set(storedSlots(existingAvailability?.availableSlots));
    // Old records represented a reservation only by removing the home slot.
    // Once reservedSlots exists, it is authoritative, including an empty list.
    const reservedSlots = [...new Set(existingAvailability?.reservedSlots === undefined
      ? storedSlots(existing?.availability).filter(slot => !currentlyAvailable.has(slot))
      : storedSlots(existingAvailability.reservedSlots))].sort();
    const reserved = new Set(reservedSlots);
    const intervals = existingAvailability?.reservedIntervals === undefined && reservedSlots.length
      ? intervalsFromBookings((await transaction.get(firestore.collection('bookingRequests').where('ownerId', '==', callerUid))).docs.map(doc => doc.data()))
      : storedIntervals(existingAvailability?.reservedIntervals);
    const modeBySlot: Record<string, AppointmentMode> = Object.fromEntries(
      (['home', 'chair'] as const).flatMap(mode => input.workModes[mode]
        ? input.availabilityByMode[mode].map(slot => [slot, mode])
        : []),
    );
    const configuredSlots = Object.keys(modeBySlot).sort();
    const previousModes = existingAvailability?.modeBySlot as RecordValue | undefined;
    const previousSlots = existing?.availabilityByMode as RecordValue | undefined;
    for (const slot of reservedSlots) {
      const previousMode = previousModes?.[slot];
      if (previousMode === 'home' || previousMode === 'chair') {
        modeBySlot[slot] = previousMode;
      } else if (storedSlots(previousSlots?.chair).includes(slot)) {
        modeBySlot[slot] = 'chair';
      } else {
        // Legacy appointments only supported home visits.
        modeBySlot[slot] = 'home';
      }
    }
    const currentPublicProfile = existing?.publicProfile as RecordValue | undefined;
    const approvalStatus = currentPublicProfile?.approvalStatus === 'approved'
      ? 'approved'
      : 'pending';
    const coordinates = CITY_COORDINATES[input.cityId];
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (slugRef) transaction.set(slugRef, { profileId, freelancerId: callerUid, updatedAt: now });
    if (oldSlugRef && oldSlugSnapshot?.data()?.profileId === profileId) transaction.delete(oldSlugRef);
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
        // City centroids are discovery hints, not a verified service origin.
        // Home visits stay unbookable until trusted origin/address geocoding exists.
        homeVisit: false,
      },
      ...(existing?.verificationStatus ? { verificationStatus: existing.verificationStatus } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    transaction.set(availabilityRef, {
      ownerId: callerUid,
      ownerType: 'freelancer',
      configuredSlots,
      availableSlots: configuredSlots.filter(slot => !reserved.has(slot)
        && freeSlot(slot, minimumServiceDuration(input.serviceDurationMinutes), intervals)),
      reservedSlots,
      reservedIntervals: intervals,
      modeBySlot,
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

export const saveFreelancerProfileFunction = europeFunctions.https.onCall((data, context) => (
  saveFreelancerProfile(context.auth?.uid ?? null, data)
));

export const createFreelancerPortfolioItemFunction = europeFunctions.https.onCall((data, context) => (
  createFreelancerPortfolioItem(context.auth?.uid ?? null, data)
));

export const deleteFreelancerPortfolioItemFunction = europeFunctions.https.onCall((data, context) => {
  const input = inputRecord(data, new Set(['portfolioItemId']), 'portfolioItemId is required');
  return deleteFreelancerPortfolioItem(
    context.auth?.uid ?? null,
    text(input.portfolioItemId, 'portfolioItemId', 256),
  );
});

export const syncFreelancerPortfolio = europeFunctions.firestore
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
