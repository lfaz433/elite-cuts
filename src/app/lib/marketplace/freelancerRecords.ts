import type { CityId } from './discovery';

export type DepositPreference = {
  mode: 'none' | 'fixed' | 'percentage';
  value: number;
};

export interface FreelancerProfile {
  uid: string;
  displayName: string;
  bio: string;
  cityId: CityId;
  languages: string[];
  serviceSummary: string;
  serviceIds: string[];
  servicePricesMinor: Record<string, number>;
  visible: boolean;
  radiusKm: number;
  travelFeeMinor: number;
  deposit: DepositPreference;
  cancellationWindowHours: number;
  availability: string[];
}

export type FreelancerProfileInput = Omit<FreelancerProfile, 'uid'>;

export interface PortfolioItem {
  id: string;
  ownerId: string;
  ownerType: 'freelancer';
  imageUrl: string;
  caption: string;
  visible: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
}

function cityId(value: unknown): value is CityId {
  return value === 'fr-paris' || value === 'fr-grenoble' || value === 'fr-mulhouse';
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function deposit(value: unknown): value is DepositPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.mode === 'none' || record.mode === 'fixed' || record.mode === 'percentage')
    && typeof record.value === 'number';
}

function servicePrices(value: unknown, serviceIds: string[]): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prices = value as Record<string, unknown>;
  const priceIds = Object.keys(prices);
  return priceIds.length === serviceIds.length
    && priceIds.every(serviceId => serviceIds.includes(serviceId))
    && serviceIds.every(serviceId => Number.isInteger(prices[serviceId]) && (prices[serviceId] as number) >= 0);
}

export function parseFreelancerProfile(uid: string, value: unknown): FreelancerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  if (
    profile.uid !== uid
    || typeof profile.displayName !== 'string'
    || typeof profile.bio !== 'string'
    || !cityId(profile.cityId)
    || !strings(profile.languages)
    || typeof profile.serviceSummary !== 'string'
    || !strings(profile.serviceIds)
    || !servicePrices(profile.servicePricesMinor, profile.serviceIds)
    || typeof profile.visible !== 'boolean'
    || typeof profile.radiusKm !== 'number'
    || typeof profile.travelFeeMinor !== 'number'
    || !deposit(profile.deposit)
    || typeof profile.cancellationWindowHours !== 'number'
    || !strings(profile.availability)
  ) return null;
  return {
    uid,
    displayName: profile.displayName,
    bio: profile.bio,
    cityId: profile.cityId,
    languages: profile.languages,
    serviceSummary: profile.serviceSummary,
    serviceIds: profile.serviceIds,
    servicePricesMinor: profile.servicePricesMinor,
    visible: profile.visible,
    radiusKm: profile.radiusKm,
    travelFeeMinor: profile.travelFeeMinor,
    deposit: profile.deposit,
    cancellationWindowHours: profile.cancellationWindowHours,
    availability: profile.availability,
  };
}

export function parsePortfolioItem(id: string, uid: string, value: unknown): PortfolioItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    item.ownerId !== uid
    || item.ownerType !== 'freelancer'
    || typeof item.imageUrl !== 'string'
    || typeof item.caption !== 'string'
    || typeof item.visible !== 'boolean'
    || (item.moderationStatus !== 'pending'
      && item.moderationStatus !== 'approved'
      && item.moderationStatus !== 'rejected')
  ) return null;
  return {
    id,
    ownerId: uid,
    ownerType: 'freelancer',
    imageUrl: item.imageUrl,
    caption: item.caption,
    visible: item.visible,
    moderationStatus: item.moderationStatus,
  };
}

export function emptyFreelancerProfile(displayName = ''): FreelancerProfileInput {
  return {
    displayName,
    bio: '',
    cityId: 'fr-paris',
    languages: ['fr'],
    serviceSummary: '',
    serviceIds: [],
    servicePricesMinor: {},
    visible: false,
    radiusKm: 10,
    travelFeeMinor: 0,
    deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24,
    availability: [],
  };
}
