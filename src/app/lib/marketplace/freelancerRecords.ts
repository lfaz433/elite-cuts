import type { CityId } from './discovery';
import { normalizePublicSlug, sanitizeSocialLinks, type FreelancerIdentity } from './identity';

export type AppointmentMode = 'home' | 'chair';
export type FreelancerWorkModes = { home: boolean; chair: boolean };
export type FreelancerWorkplace = {
  name: string;
  line1: string;
  postalCode: string;
  city: string;
};

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
  serviceDurationMinutes: Record<string, number>;
  workModes: FreelancerWorkModes;
  availabilityByMode: Record<AppointmentMode, string[]>;
  workplace?: FreelancerWorkplace;
  visible: boolean;
  radiusKm: number;
  travelFeeMinor: number;
  deposit: DepositPreference;
  cancellationWindowHours: number;
  availability: string[];
  identity: FreelancerIdentity;
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

function serviceDurations(value: unknown, serviceIds: string[]): value is Record<string, number> {
  return servicePrices(value, serviceIds)
    && Object.values(value).every(minutes => minutes >= 15 && minutes <= 360);
}

function workModes(value: unknown): value is FreelancerWorkModes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const modes = value as Record<string, unknown>;
  return typeof modes.home === 'boolean' && typeof modes.chair === 'boolean';
}

function availabilityByMode(value: unknown): value is Record<AppointmentMode, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slots = value as Record<string, unknown>;
  if (!strings(slots.home) || !strings(slots.chair)) return false;
  const allSlots = [...slots.home, ...slots.chair];
  return new Set(allSlots).size === allSlots.length;
}

function workplace(value: unknown): FreelancerWorkplace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const place = value as Record<string, unknown>;
  if (![place.name, place.line1, place.postalCode, place.city].every(field => (
    typeof field === 'string' && field.trim().length > 0
  ))) return null;
  return {
    name: place.name as string,
    line1: place.line1 as string,
    postalCode: place.postalCode as string,
    city: place.city as string,
  };
}

function profileImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function identity(value: unknown): FreelancerIdentity | null {
  if (value === undefined) return { socialLinks: {}, publicSlug: '' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['profileImageUrl', 'socialLinks', 'publicSlug'].includes(key))) {
    return null;
  }
  if (record.profileImageUrl !== undefined && !profileImageUrl(record.profileImageUrl)) return null;
  if (typeof record.publicSlug !== 'string') return null;
  try {
    if (normalizePublicSlug(record.publicSlug) !== record.publicSlug) return null;
    return {
      ...(record.profileImageUrl ? { profileImageUrl: record.profileImageUrl } : {}),
      socialLinks: sanitizeSocialLinks(record.socialLinks),
      publicSlug: record.publicSlug,
    };
  } catch {
    return null;
  }
}

export function parseFreelancerProfile(uid: string, value: unknown): FreelancerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  const publicIdentity = identity(profile.identity);
  const modes = profile.workModes === undefined ? { home: true, chair: false } : profile.workModes;
  const slots = profile.availabilityByMode === undefined
    ? { home: profile.availability, chair: [] }
    : profile.availabilityByMode;
  const place = profile.workplace === undefined ? undefined : workplace(profile.workplace);
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
    || !workModes(modes)
    || !availabilityByMode(slots)
    || (profile.workplace !== undefined && !place)
    || (modes.chair && !place)
    || (profile.serviceDurationMinutes !== undefined
      && !serviceDurations(profile.serviceDurationMinutes, profile.serviceIds))
    || !publicIdentity
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
    serviceDurationMinutes: profile.serviceDurationMinutes === undefined
      ? Object.fromEntries(profile.serviceIds.map(serviceId => [serviceId, 30]))
      : profile.serviceDurationMinutes as Record<string, number>,
    workModes: { home: modes.home, chair: modes.chair },
    availabilityByMode: { home: slots.home, chair: slots.chair },
    ...(place ? { workplace: place } : {}),
    visible: profile.visible,
    radiusKm: profile.radiusKm,
    travelFeeMinor: profile.travelFeeMinor,
    deposit: profile.deposit,
    cancellationWindowHours: profile.cancellationWindowHours,
    availability: slots.home,
    identity: publicIdentity,
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
    serviceDurationMinutes: {},
    workModes: { home: true, chair: false },
    availabilityByMode: { home: [], chair: [] },
    visible: false,
    radiusKm: 10,
    travelFeeMinor: 0,
    deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24,
    availability: [],
    identity: { socialLinks: {}, publicSlug: '' },
  };
}
