import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { europeFunctions } from './runtime';
import {
  parseFreelancerProfileInput, normalizePublicSlug, sanitizeSocialLinks,
  AppointmentMode, FreelancerWorkModes, FreelancerWorkplace,
} from './freelancers';

export type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';

export interface CityLaunch {
  status: 'enabled' | 'disabled';
}

export interface PublicProfileProjection {
  kind: 'salon' | 'freelancer';
  cityId: CityId;
  latitude: number;
  longitude: number;
  serviceSummary: string;
  portfolioUrls: string[];
  visible: true;
  approvalStatus: 'approved' | 'pending';
  displayName: string;
  serviceIds: string[];
  homeVisit: boolean;
}

export interface FreelancerPublicProfileProjection extends PublicProfileProjection {
  kind: 'freelancer';
  publicSlug: string;
  bio: string;
  profileImageUrl?: string;
  socialLinks: Record<string, string>;
  services: Array<{ id: string; label: string; priceMinor: number; durationMinutes: number }>;
  workModes: FreelancerWorkModes;
  workplace?: FreelancerWorkplace;
  cancellationWindowHours: number;
  reviewSummary: { average: null; count: 0; reviews: [] };
}

export type PublicFreelancerReview = {
  rating: number;
  text?: string;
  authorName: string;
  createdAtMs: number;
};

export type PublicFreelancerPage = {
  id: string;
  publicSlug: string;
  displayName: string;
  cityId: CityId;
  bio: string;
  serviceSummary: string;
  profileImageUrl?: string;
  portfolioUrls: string[];
  services: Array<{ id: string; label: string; priceMinor: number; durationMinutes: number }>;
  workModes: FreelancerWorkModes;
  workplace?: FreelancerWorkplace;
  socialLinks: Record<string, string>;
  cancellationWindowHours: number;
  reviewSummary: { average: number | null; count: number; reviews: PublicFreelancerReview[] };
  slots: Array<{ value: string; appointmentMode: AppointmentMode }>;
};

export interface PublicProfile extends Omit<PublicProfileProjection, 'approvalStatus'> {
  id: string;
}

export interface PublicCity {
  id: CityId;
  label: string;
}

const CITY_IDS: readonly CityId[] = ['fr-paris', 'fr-grenoble', 'fr-mulhouse'];
const CITY_DISPLAY_COORDINATES: Record<CityId, { latitude: number; longitude: number }> = {
  'fr-paris': { latitude: 48.85, longitude: 2.35 },
  'fr-grenoble': { latitude: 45.18, longitude: 5.72 },
  'fr-mulhouse': { latitude: 47.75, longitude: 7.33 },
};
export const MAX_PUBLIC_PORTFOLIO_URLS = 12;
const MAX_SERVICE_IDS = 24;
const CITY_LABELS: Record<CityId, string> = {
  'fr-paris': 'Paris',
  'fr-grenoble': 'Grenoble',
  'fr-mulhouse': 'Mulhouse',
};

export const enabledCity = (cityId: CityId, launch: CityLaunch): boolean => (
  launch.status === 'enabled'
);

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isCityId(value: unknown): value is CityId {
  return typeof value === 'string' && CITY_IDS.includes(value as CityId);
}

function cityIdFrom(value: unknown): CityId | null {
  if (isCityId(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('fr-FR');
  if (normalized === 'paris') return 'fr-paris';
  if (normalized === 'grenoble') return 'fr-grenoble';
  if (normalized === 'mulhouse') return 'fr-mulhouse';
  return null;
}

function publicText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const output = value.trim();
  return output !== '' && output.length <= maximum ? output : null;
}

function publicCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function publicUrls(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PUBLIC_PORTFOLIO_URLS) return null;
  const urls = value.map(url => publicText(url, 2_048));
  if (urls.some(url => url === null || !url.startsWith('https://'))) return null;
  return urls as string[];
}

function publicServiceIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SERVICE_IDS) return null;
  const ids = value.map(id => publicText(id, 128));
  if (ids.some(id => id === null)) return null;
  return [...new Set(ids as string[])];
}

export function sanitizePublicProfile(id: string, value: unknown): PublicProfile | null {
  const profile = record(value);
  if (!profile || (profile.kind !== 'salon' && profile.kind !== 'freelancer')) return null;
  const cityId = cityIdFrom(profile.cityId);
  const displayName = publicText(profile.displayName, 160);
  const serviceSummary = publicText(profile.serviceSummary, 500);
  const portfolioUrls = publicUrls(profile.portfolioUrls);
  const serviceIds = publicServiceIds(profile.serviceIds);
  if (
    !cityId
    || profile.visible !== true
    || profile.approvalStatus !== 'approved'
    || !displayName
    || !serviceSummary
    || !portfolioUrls
    || !serviceIds
    || publicCoordinate(profile.latitude, -90, 90) === null
    || publicCoordinate(profile.longitude, -180, 180) === null
  ) {
    return null;
  }
  const displayCoordinates = CITY_DISPLAY_COORDINATES[cityId];
  return {
    id,
    kind: profile.kind,
    cityId,
    latitude: displayCoordinates.latitude,
    longitude: displayCoordinates.longitude,
    serviceSummary,
    portfolioUrls,
    visible: true,
    displayName,
    serviceIds,
    // Fail closed for both current and stale stored projections until trusted
    // address geocoding can verify home-visit eligibility server-side.
    homeVisit: false,
  };
}

function publicProfileConfig(value: unknown): Record<string, unknown> | null {
  const config = record(value);
  if (!config) return null;
  const allowed = new Set([
    'approvalStatus', 'visible', 'cityId', 'latitude', 'longitude',
    'serviceSummary', 'portfolioUrls', 'serviceIds', 'homeVisit',
  ]);
  return Object.keys(config).every(key => allowed.has(key)) ? config : null;
}

function buildPublicProfile(
  kind: 'salon' | 'freelancer',
  source: unknown,
  displayName: unknown,
  city: unknown,
): PublicProfileProjection | null {
  const sourceRecord = record(source);
  if (!sourceRecord) return null;
  const config = publicProfileConfig(sourceRecord.publicProfile);
  if (!config || config.visible !== true || (
    config.approvalStatus !== 'approved' && !(kind === 'freelancer' && config.approvalStatus === 'pending')
  )) return null;

  const cityId = cityIdFrom(config.cityId ?? city);
  const name = publicText(displayName, 160);
  const latitude = publicCoordinate(config.latitude, -90, 90);
  const longitude = publicCoordinate(config.longitude, -180, 180);
  const serviceSummary = publicText(config.serviceSummary, 500);
  const portfolioUrls = publicUrls(config.portfolioUrls);
  const serviceIds = publicServiceIds(config.serviceIds);

  if (
    !cityId
    || !name
    || latitude === null
    || longitude === null
    || !serviceSummary
    || !portfolioUrls
    || !serviceIds
  ) {
    return null;
  }

  // A discovery pin identifies only a coarse city display point. Exact source
  // coordinates are validated for completeness but never copied to public data.
  const displayCoordinates = CITY_DISPLAY_COORDINATES[cityId];

  return {
    kind,
    cityId,
    latitude: displayCoordinates.latitude,
    longitude: displayCoordinates.longitude,
    serviceSummary,
    portfolioUrls,
    visible: true,
    approvalStatus: config.approvalStatus,
    displayName: name,
    serviceIds,
    // Source configuration is deliberately ignored while home visits cannot be
    // validated against a trusted geocoded service area.
    homeVisit: false,
  };
}

export function projectSalonPublicProfile(
  locationId: string,
  source: unknown,
): PublicProfileProjection | null {
  void locationId;
  const location = record(source);
  return buildPublicProfile('salon', location, location?.name, location?.city);
}

export function projectFreelancerPublicProfile(
  uid: string,
  source: unknown,
): FreelancerPublicProfileProjection | null {
  void uid;
  const profile = record(source);
  if (!profile || profile.visible !== true) return null;
  const base = buildPublicProfile(
    'freelancer',
    profile,
    profile?.displayName ?? profile?.name,
    profile?.cityId ?? profile?.city,
  );
  if (!base) return null;
  try {
    // Validate the stored contract as strictly as a save, but select its input
    // fields explicitly so unrelated private source data can never be copied.
    const input = parseFreelancerProfileInput({
      displayName: profile.displayName,
      bio: profile.bio,
      cityId: profile.cityId,
      languages: profile.languages,
      serviceSummary: profile.serviceSummary,
      serviceIds: profile.serviceIds,
      servicePricesMinor: profile.servicePricesMinor,
      // Match Task 1's legacy defaults only when a new field is absent.
      // Explicit malformed values still go through strict input validation.
      serviceDurationMinutes: profile.serviceDurationMinutes === undefined
        ? Object.fromEntries((publicServiceIds(profile.serviceIds) ?? []).map(id => [id, 30]))
        : profile.serviceDurationMinutes,
      workModes: profile.workModes === undefined ? { home: true, chair: false } : profile.workModes,
      availabilityByMode: profile.availabilityByMode === undefined
        ? { home: profile.availability, chair: [] }
        : profile.availabilityByMode,
      ...(profile.workplace === undefined ? {} : { workplace: profile.workplace }),
      visible: profile.visible,
      radiusKm: profile.radiusKm,
      travelFeeMinor: profile.travelFeeMinor,
      deposit: profile.deposit,
      cancellationWindowHours: profile.cancellationWindowHours,
      availability: profile.availability,
      identity: profile.identity,
    });
    // Stored slugs must already be canonical so the projection and index agree.
    if (record(profile.identity)?.publicSlug !== input.identity.publicSlug) return null;
    return {
      ...base,
      kind: 'freelancer',
      publicSlug: input.identity.publicSlug,
      bio: input.bio,
      ...(input.identity.profileImageUrl ? { profileImageUrl: input.identity.profileImageUrl } : {}),
      socialLinks: { ...input.identity.socialLinks },
      serviceIds: input.serviceIds,
      services: input.serviceIds.map(id => ({
        id,
        label: id.split('-').filter(Boolean).map((word, index) => {
          const lower = word.toLocaleLowerCase('fr-FR');
          return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
        }).join(' '),
        priceMinor: input.servicePricesMinor[id],
        durationMinutes: input.serviceDurationMinutes[id],
      })),
      workModes: input.workModes,
      ...(input.workModes.chair && input.workplace ? { workplace: input.workplace } : {}),
      cancellationWindowHours: input.cancellationWindowHours,
      reviewSummary: { average: null, count: 0, reviews: [] },
    };
  } catch {
    return null;
  }
}

async function writeProjection(
  profileId: string,
  projection: PublicProfileProjection | null,
): Promise<void> {
  const reference = admin.firestore().collection('publicProfiles').doc(profileId);
  if (projection) {
    await reference.set(projection);
    return;
  }
  await reference.delete();
}

async function cityIsEnabled(
  cityId: CityId,
  firestore: admin.firestore.Firestore,
): Promise<boolean> {
  const launch = await firestore.collection('cityLaunches').doc(cityId).get();
  return launch.exists && enabledCity(cityId, launch.data() as CityLaunch);
}

export async function listEnabledPublicCities(
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<PublicCity[]> {
  const launches = await firestore.collection('cityLaunches').where('status', '==', 'enabled').get();
  return launches.docs
    .filter(launch => isCityId(launch.id) && enabledCity(launch.id, launch.data() as CityLaunch))
    .map(launch => ({ id: launch.id as CityId, label: CITY_LABELS[launch.id as CityId] }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export async function listApprovedPublicProfiles(
  cityId: CityId,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<PublicProfile[]> {
  if (!await cityIsEnabled(cityId, firestore)) return [];
  const profiles = await firestore.collection('publicProfiles')
    .where('cityId', '==', cityId)
    .where('visible', '==', true)
    .where('approvalStatus', '==', 'approved')
    .get();
  return profiles.docs
    .map(profile => sanitizePublicProfile(profile.id, profile.data()))
    .filter((profile): profile is PublicProfile => profile !== null && profile.cityId === cityId)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'fr'));
}

export async function getApprovedPublicProfile(
  profileId: string,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<PublicProfile | null> {
  const snapshot = await firestore.collection('publicProfiles').doc(profileId).get();
  const profile = snapshot.exists ? sanitizePublicProfile(snapshot.id, snapshot.data()) : null;
  return profile && await cityIsEnabled(profile.cityId, firestore) ? profile : null;
}

function closedPublicRecord(value: unknown, keys: string[]): Record<string, unknown> | null {
  const input = record(value);
  return input && Object.keys(input).every(key => keys.includes(key)) ? input : null;
}

function publicInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function publicHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function publicSlot(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const date = new Date(`${value}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

function directProfilePage(id: string, slug: string, value: unknown, now: number): PublicFreelancerPage | null {
  const profile = record(value);
  if (!profile || profile.kind !== 'freelancer' || profile.visible !== true
    || (profile.approvalStatus !== 'approved' && profile.approvalStatus !== 'pending') || profile.publicSlug !== slug
    || !isCityId(profile.cityId)) return null;
  const displayName = publicText(profile.displayName, 160);
  const serviceSummary = publicText(profile.serviceSummary, 500);
  const modes = closedPublicRecord(profile.workModes, ['home', 'chair']);
  const summary = closedPublicRecord(profile.reviewSummary, ['average', 'count', 'reviews']);
  if (!displayName || !serviceSummary || typeof profile.bio !== 'string' || profile.bio.length > 1000
    || !modes || typeof modes.home !== 'boolean' || typeof modes.chair !== 'boolean' || (!modes.home && !modes.chair)
    || !Array.isArray(profile.portfolioUrls) || profile.portfolioUrls.length > MAX_PUBLIC_PORTFOLIO_URLS
    || !profile.portfolioUrls.every(publicHttpsUrl)
    || (profile.profileImageUrl !== undefined && !publicHttpsUrl(profile.profileImageUrl))
    || !Array.isArray(profile.services) || profile.services.length === 0 || profile.services.length > MAX_SERVICE_IDS
    || !publicInteger(profile.cancellationWindowHours, 0, 720)
    || !summary || !publicInteger(summary.count, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(summary.reviews)
    || summary.reviews.length > summary.count || summary.reviews.length > 100
    || (summary.count === 0 ? summary.average !== null
      : typeof summary.average !== 'number' || !Number.isFinite(summary.average) || summary.average < 1 || summary.average > 5)
  ) return null;

  const services: PublicFreelancerPage['services'] = [];
  for (const value of profile.services) {
    const service = closedPublicRecord(value, ['id', 'label', 'priceMinor', 'durationMinutes']);
    const serviceId = publicText(service?.id, 128);
    const label = publicText(service?.label, 160);
    if (!service || !serviceId || !label || services.some(existing => existing.id === serviceId)
      || !publicInteger(service.priceMinor, 0, 1_000_000) || !publicInteger(service.durationMinutes, 15, 360)) return null;
    services.push({ id: serviceId, label, priceMinor: service.priceMinor, durationMinutes: service.durationMinutes });
  }
  let workplace: FreelancerWorkplace | undefined;
  if (modes.chair) {
    const place = closedPublicRecord(profile.workplace, ['name', 'line1', 'postalCode', 'city']);
    const name = publicText(place?.name, 160);
    const line1 = publicText(place?.line1, 240);
    const postalCode = publicText(place?.postalCode, 20);
    const city = publicText(place?.city, 120);
    if (!name || !line1 || !postalCode || !city) return null;
    workplace = { name, line1, postalCode, city };
  }
  const reviews: PublicFreelancerReview[] = [];
  for (const value of summary.reviews) {
    const review = closedPublicRecord(value, ['rating', 'text', 'authorName', 'createdAtMs']);
    const authorName = publicText(review?.authorName, 120);
    if (!review || !authorName || !publicInteger(review.rating, 1, 5)
      || !publicInteger(review.createdAtMs, 0, now)
      || (review.text !== undefined && (typeof review.text !== 'string' || review.text.length > 2000))) return null;
    reviews.push({ rating: review.rating, authorName, createdAtMs: review.createdAtMs,
      ...(typeof review.text === 'string' ? { text: review.text } : {}) });
  }
  let socialLinks: Record<string, string>;
  try {
    const links = record(profile.socialLinks);
    if (!links || Object.entries(links).some(([key, value]) => key !== 'whatsapp' && !publicHttpsUrl(value))) return null;
    socialLinks = { ...sanitizeSocialLinks(links) };
  } catch { return null; }
  return {
    id, publicSlug: slug, displayName, cityId: profile.cityId, bio: profile.bio, serviceSummary,
    ...(typeof profile.profileImageUrl === 'string' ? { profileImageUrl: profile.profileImageUrl } : {}),
    portfolioUrls: [...profile.portfolioUrls], services, workModes: { home: modes.home, chair: modes.chair },
    ...(workplace ? { workplace } : {}), socialLinks, cancellationWindowHours: profile.cancellationWindowHours,
    reviewSummary: { average: typeof summary.average === 'number' ? summary.average : null, count: summary.count, reviews },
    slots: [],
  };
}

export async function getPublicFreelancerPageBySlug(
  value: string,
  firestore: admin.firestore.Firestore = admin.firestore(),
  now = Date.now(),
): Promise<PublicFreelancerPage> {
  const slug = normalizePublicSlug(value);
  const notFound = () => new functions.https.HttpsError('not-found', 'Public freelancer profile not found');
  const indexSnapshot = await firestore.collection('publicProfileSlugs').doc(slug).get();
  const index = indexSnapshot.exists ? record(indexSnapshot.data()) : null;
  if (!index || typeof index.freelancerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(index.freelancerId)
    || index.profileId !== `freelancer__${index.freelancerId}`) throw notFound();
  const [profileSnapshot, availabilitySnapshot] = await Promise.all([
    firestore.collection('publicProfiles').doc(index.profileId).get(),
    firestore.collection('availability').doc(index.freelancerId).get(),
  ]);
  const page = profileSnapshot.exists ? directProfilePage(index.profileId, slug, profileSnapshot.data(), now) : null;
  const availability = availabilitySnapshot.exists ? record(availabilitySnapshot.data()) : null;
  const modeBySlot = record(availability?.modeBySlot);
  if (!page || !availability || availability.ownerId !== index.freelancerId || availability.ownerType !== 'freelancer'
    || !Array.isArray(availability.availableSlots) || !Array.isArray(availability.reservedSlots)
    || !availability.reservedSlots.every(publicSlot) || !modeBySlot || !Number.isFinite(now)) throw notFound();
  const reserved = new Set(availability.reservedSlots);
  page.slots = [...new Set(availability.availableSlots.filter(publicSlot))].sort().flatMap(value => {
    const appointmentMode = modeBySlot[value];
    if (new Date(`${value}:00.000Z`).getTime() <= now || reserved.has(value)
      || (appointmentMode !== 'home' && appointmentMode !== 'chair') || !page.workModes[appointmentMode]) return [];
    return [{ value, appointmentMode }];
  });
  return page;
}

function callInput(value: unknown, key: 'cityId' | 'profileId' | 'slug'): string {
  const input = record(value);
  if (!input || Object.keys(input).length !== 1 || typeof input[key] !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', `${key} is required`);
  }
  return input[key].trim();
}

function requestedCityId(value: unknown): CityId {
  const cityId = callInput(value, 'cityId');
  if (!isCityId(cityId)) {
    throw new functions.https.HttpsError('invalid-argument', 'cityId is invalid');
  }
  return cityId;
}

function requestedProfileId(value: unknown): string {
  const profileId = callInput(value, 'profileId');
  if (!/^(salon|freelancer)__[A-Za-z0-9_-]{1,128}$/.test(profileId)) {
    throw new functions.https.HttpsError('invalid-argument', 'profileId is invalid');
  }
  return profileId;
}

export const listPublicCitiesFunction = europeFunctions.https.onCall(async () => listEnabledPublicCities());

export const listPublicProfilesFunction = europeFunctions.https.onCall(async data => (
  listApprovedPublicProfiles(requestedCityId(data))
));

export const getPublicProfileFunction = europeFunctions.https.onCall(async data => {
  const profileId = requestedProfileId(data);
  return getApprovedPublicProfile(profileId);
});

export const getPublicFreelancerPageBySlugFunction = europeFunctions.https.onCall(async data => (
  getPublicFreelancerPageBySlug(normalizePublicSlug(callInput(data, 'slug')))
));

export const syncSalonPublicProfile = europeFunctions.firestore
  .document('salonLocations/{locationId}')
  .onWrite(async (change, context) => {
    const projection = change.after.exists
      ? projectSalonPublicProfile(context.params.locationId, change.after.data())
      : null;
    await writeProjection(`salon__${context.params.locationId}`, projection);
  });

export const syncFreelancerPublicProfile = europeFunctions.firestore
  .document('freelancerProfiles/{uid}')
  .onWrite(async (change, context) => {
    const projection = change.after.exists
      ? projectFreelancerPublicProfile(context.params.uid, change.after.data())
      : null;
    await writeProjection(`freelancer__${context.params.uid}`, projection);
  });
