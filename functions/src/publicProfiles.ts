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
  displayName: string;
  serviceIds: string[];
  homeVisit: boolean;
}

const CITY_IDS: readonly CityId[] = ['fr-paris', 'fr-grenoble', 'fr-mulhouse'];
const MAX_PORTFOLIO_URLS = 12;
const MAX_SERVICE_IDS = 24;

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

  return {
    kind,
    cityId,
    latitude,
    longitude,
    serviceSummary,
    portfolioUrls,
    visible: true,
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
