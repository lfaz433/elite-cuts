import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

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

const CITY_LABELS: Record<CityId, string> = {
  'fr-paris': 'Paris',
  'fr-grenoble': 'Grenoble',
  'fr-mulhouse': 'Mulhouse',
};

function isCityId(value: string): value is CityId {
  return value === 'fr-paris' || value === 'fr-grenoble' || value === 'fr-mulhouse';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parsePublicProfile(id: string, value: Record<string, unknown>): PublicProfile | null {
  if (
    (value.kind !== 'salon' && value.kind !== 'freelancer')
    || typeof value.cityId !== 'string'
    || !isCityId(value.cityId)
    || typeof value.latitude !== 'number'
    || typeof value.longitude !== 'number'
    || typeof value.serviceSummary !== 'string'
    || !isStringArray(value.portfolioUrls)
    || value.visible !== true
    || typeof value.displayName !== 'string'
    || !isStringArray(value.serviceIds)
    || typeof value.homeVisit !== 'boolean'
  ) {
    return null;
  }
  return {
    id,
    kind: value.kind,
    cityId: value.cityId,
    latitude: value.latitude,
    longitude: value.longitude,
    serviceSummary: value.serviceSummary,
    portfolioUrls: value.portfolioUrls,
    visible: true,
    displayName: value.displayName,
    serviceIds: value.serviceIds,
    homeVisit: value.homeVisit,
  };
}

export async function listEnabledCities(): Promise<PublicCity[]> {
  const snapshot = await getDocs(query(
    collection(db, 'cityLaunches'),
    where('status', '==', 'enabled'),
  ));
  return snapshot.docs
    .filter(city => isCityId(city.id))
    .map(city => ({ id: city.id, label: CITY_LABELS[city.id] }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export async function listPublicProfiles({
  cityId,
  serviceId,
  homeVisit,
}: PublicProfileFilters): Promise<PublicProfile[]> {
  // City discovery stays deliberately small. Filtering this already public
  // per-city result locally avoids introducing a composite public index.
  const snapshot = await getDocs(query(
    collection(db, 'publicProfiles'),
    where('cityId', '==', cityId),
    where('visible', '==', true),
  ));
  return snapshot.docs
    .map(profile => parsePublicProfile(profile.id, profile.data()))
    .filter((profile): profile is PublicProfile => profile !== null)
    .filter(profile => !serviceId || profile.serviceIds.includes(serviceId))
    .filter(profile => homeVisit === undefined || profile.homeVisit === homeVisit)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'fr'));
}

export async function getPublicProfile(profileId: string): Promise<PublicProfile | null> {
  const snapshot = await getDoc(doc(db, 'publicProfiles', profileId));
  return snapshot.exists() ? parsePublicProfile(snapshot.id, snapshot.data()) : null;
}
