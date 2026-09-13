import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export type CityId = 'fr-paris' | 'fr-grenoble' | 'fr-mulhouse';

export interface PublicCity {
  id: CityId;
  label: string;
}

export interface PublicProfile {
  id: string;
  kind: 'salon' | 'freelancer';
  cityId: CityId;
  latitude: number;
  longitude: number;
  serviceSummary: string;
  portfolioUrls: string[];
  visible: boolean;
  displayName: string;
  serviceIds: string[];
  homeVisit: boolean;
}

export interface PublicProfileFilters {
  cityId: CityId;
  serviceId?: string;
  homeVisit?: boolean;
}

function isCityId(value: string): value is CityId {
  return value === 'fr-paris' || value === 'fr-grenoble' || value === 'fr-mulhouse';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parsePublicProfile(value: unknown): PublicProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (
    typeof profile.id !== 'string'
    || (profile.kind !== 'salon' && profile.kind !== 'freelancer')
    || typeof profile.cityId !== 'string'
    || !isCityId(profile.cityId)
    || typeof profile.latitude !== 'number'
    || typeof profile.longitude !== 'number'
    || typeof profile.serviceSummary !== 'string'
    || !isStringArray(profile.portfolioUrls)
    || profile.visible !== true
    || typeof profile.displayName !== 'string'
    || !isStringArray(profile.serviceIds)
    || typeof profile.homeVisit !== 'boolean'
  ) {
    return null;
  }
  return {
    id: profile.id,
    kind: profile.kind,
    cityId: profile.cityId,
    latitude: profile.latitude,
    longitude: profile.longitude,
    serviceSummary: profile.serviceSummary,
    portfolioUrls: profile.portfolioUrls,
    visible: true,
    displayName: profile.displayName,
    serviceIds: profile.serviceIds,
    homeVisit: profile.homeVisit,
  };
}

const listCities = httpsCallable<undefined, unknown>(functions, 'listPublicCities');
const listProfiles = httpsCallable<{ cityId: CityId }, unknown>(functions, 'listPublicProfiles');
const getProfile = httpsCallable<{ profileId: string }, unknown>(functions, 'getPublicProfile');

export async function listEnabledCities(): Promise<PublicCity[]> {
  const result = await listCities();
  if (!Array.isArray(result.data)) return [];
  return result.data
    .filter((city): city is Record<string, unknown> => (
      !!city && typeof city === 'object' && !Array.isArray(city)
    ))
    .filter((city): city is Record<string, string> => (
      isCityId(city.id) && typeof city.label === 'string'
    ))
    .map(city => ({ id: city.id as CityId, label: city.label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export async function listPublicProfiles({
  cityId,
  serviceId,
  homeVisit,
}: PublicProfileFilters): Promise<PublicProfile[]> {
  const result = await listProfiles({ cityId });
  if (!Array.isArray(result.data)) return [];
  return result.data
    .map(parsePublicProfile)
    .filter((profile): profile is PublicProfile => profile !== null)
    .filter(profile => !serviceId || profile.serviceIds.includes(serviceId))
    .filter(profile => homeVisit === undefined || profile.homeVisit === homeVisit)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'fr'));
}

export async function getPublicProfile(profileId: string): Promise<PublicProfile | null> {
  const result = await getProfile({ profileId });
  return parsePublicProfile(result.data);
}
