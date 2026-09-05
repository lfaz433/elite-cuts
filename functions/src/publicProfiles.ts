import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

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
  approvalStatus: 'approved';
  displayName: string;
  serviceIds: string[];
  homeVisit: boolean;
}

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
const MAX_PORTFOLIO_URLS = 12;
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
  if (!Array.isArray(value) || value.length > MAX_PORTFOLIO_URLS) return null;
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
    || typeof profile.homeVisit !== 'boolean'
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
    homeVisit: profile.homeVisit,
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
  if (!config || config.approvalStatus !== 'approved' || config.visible !== true) return null;

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
    || (config.homeVisit !== undefined && typeof config.homeVisit !== 'boolean')
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
    approvalStatus: 'approved',
    displayName: name,
    serviceIds,
    homeVisit: config.homeVisit === true,
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
): PublicProfileProjection | null {
  void uid;
  const profile = record(source);
  return buildPublicProfile(
    'freelancer',
    profile,
    profile?.displayName ?? profile?.name,
    profile?.cityId ?? profile?.city,
  );
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

function callInput(value: unknown, key: 'cityId' | 'profileId'): string {
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

export const listPublicCitiesFunction = functions.https.onCall(async () => listEnabledPublicCities());

export const listPublicProfilesFunction = functions.https.onCall(async data => (
  listApprovedPublicProfiles(requestedCityId(data))
));

export const getPublicProfileFunction = functions.https.onCall(async data => {
  const profileId = requestedProfileId(data);
  return getApprovedPublicProfile(profileId);
});

export const syncSalonPublicProfile = functions.firestore
  .document('salonLocations/{locationId}')
  .onWrite(async (change, context) => {
    const projection = change.after.exists
      ? projectSalonPublicProfile(context.params.locationId, change.after.data())
      : null;
    await writeProjection(`salon__${context.params.locationId}`, projection);
  });

export const syncFreelancerPublicProfile = functions.firestore
  .document('freelancerProfiles/{uid}')
  .onWrite(async (change, context) => {
    const projection = change.after.exists
      ? projectFreelancerPublicProfile(context.params.uid, change.after.data())
      : null;
    await writeProjection(`freelancer__${context.params.uid}`, projection);
  });
