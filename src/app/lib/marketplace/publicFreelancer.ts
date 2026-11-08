import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { CityId } from './discovery';
import type { AppointmentMode, FreelancerWorkModes, FreelancerWorkplace } from './freelancerRecords';
import { normalizePublicSlug, sanitizeSocialLinks } from './identity';

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
  travelFeeMinor: number;
  reviewSummary: { average: number | null; count: number; reviews: PublicFreelancerReview[] };
  slots: Array<{ value: string; appointmentMode: AppointmentMode; serviceIds?: string[] }>;
};

export function bookingFieldsFor(mode: AppointmentMode): string[] {
  return ['clientName', 'clientEmail', 'clientPhone', ...(mode === 'home' ? ['approximateArea', 'homeAddress'] : [])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedRecord(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!isRecord(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  return value;
}

function text(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function httpsUrl(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

const PARIS_SLOT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function futureSlot(value: unknown, now: number): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  const date = new Date(`${value}:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value) return false;
  // Match the server/booking policy: reject nonexistent and ambiguous Paris
  // wall times, and compare the unique instant rather than the UTC-shaped text.
  const wallTimeAsUtc = date.getTime();
  let epochMs: number | null = null;
  for (let deltaMinutes = -180; deltaMinutes <= 180; deltaMinutes += 15) {
    const candidate = wallTimeAsUtc + deltaMinutes * 60_000;
    const parts = Object.fromEntries(PARIS_SLOT_FORMAT.formatToParts(candidate).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== value) continue;
    if (epochMs !== null) return false;
    epochMs = candidate;
  }
  return epochMs !== null && epochMs > now;
}

export function parsePublicFreelancerPage(value: unknown, now = Date.now()): PublicFreelancerPage | null {
  const page = closedRecord(value, [
    'id', 'publicSlug', 'displayName', 'cityId', 'bio', 'serviceSummary', 'profileImageUrl', 'portfolioUrls',
    'services', 'workModes', 'workplace', 'socialLinks', 'cancellationWindowHours', 'travelFeeMinor', 'reviewSummary', 'slots',
  ]);
  if (!page || !Number.isFinite(now) || typeof page.id !== 'string' || !/^freelancer__[A-Za-z0-9_-]{1,128}$/.test(page.id)
    || typeof page.publicSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(page.publicSlug)
    || !text(page.displayName, 160) || !text(page.bio, 1000, true) || !text(page.serviceSummary, 500)
    || (page.cityId !== 'fr-paris' && page.cityId !== 'fr-grenoble' && page.cityId !== 'fr-mulhouse')
    || (page.profileImageUrl !== undefined && !httpsUrl(page.profileImageUrl))
    || !Array.isArray(page.portfolioUrls) || page.portfolioUrls.length > 12 || !page.portfolioUrls.every(httpsUrl)
    || !Array.isArray(page.services) || page.services.length === 0 || page.services.length > 24
    || !Array.isArray(page.slots) || page.slots.length > 200 || !integer(page.cancellationWindowHours, 0, 720)
    || !integer(page.travelFeeMinor, 0, 1_000_000)) return null;
  try { if (normalizePublicSlug(page.publicSlug) !== page.publicSlug) return null; } catch { return null; }
  const modes = closedRecord(page.workModes, ['home', 'chair']);
  if (!modes || typeof modes.home !== 'boolean' || typeof modes.chair !== 'boolean' || (!modes.home && !modes.chair)) return null;
  const services: PublicFreelancerPage['services'] = [];
  for (const value of page.services) {
    const service = closedRecord(value, ['id', 'label', 'priceMinor', 'durationMinutes']);
    if (!service || !text(service.id, 128) || !text(service.label, 160)
      || !integer(service.priceMinor, 0, 1_000_000) || !integer(service.durationMinutes, 15, 360)
      || services.some(existing => existing.id === service.id)) return null;
    services.push({ id: service.id, label: service.label, priceMinor: service.priceMinor, durationMinutes: service.durationMinutes });
  }
  let workplace: FreelancerWorkplace | undefined;
  if (modes.chair) {
    const place = closedRecord(page.workplace, ['name', 'line1', 'postalCode', 'city']);
    if (!place || !text(place.name, 160) || !text(place.line1, 240) || !text(place.postalCode, 20) || !text(place.city, 120)) return null;
    workplace = { name: place.name, line1: place.line1, postalCode: place.postalCode, city: place.city };
  } else if (page.workplace !== undefined) return null;
  const links = closedRecord(page.socialLinks, ['instagram', 'tiktok', 'facebook', 'website', 'whatsapp']);
  if (!links || Object.entries(links).some(([key, value]) => key !== 'whatsapp' && !httpsUrl(value))) return null;
  let socialLinks: Record<string, string>;
  try { socialLinks = { ...sanitizeSocialLinks(links) }; } catch { return null; }
  const summary = closedRecord(page.reviewSummary, ['average', 'count', 'reviews']);
  if (!summary || !integer(summary.count, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(summary.reviews)
    || summary.reviews.length > summary.count || summary.reviews.length > 5
    || (summary.count === 0 ? summary.average !== null
      : typeof summary.average !== 'number' || !Number.isFinite(summary.average) || summary.average < 1 || summary.average > 5)) return null;
  const reviews: PublicFreelancerReview[] = [];
  for (const value of summary.reviews) {
    const review = closedRecord(value, ['rating', 'text', 'authorName', 'createdAtMs']);
    if (!review || !integer(review.rating, 1, 5) || !text(review.authorName, 120) || !integer(review.createdAtMs, 0, now)
      || (review.text !== undefined && !text(review.text, 500, true))) return null;
    reviews.push({ rating: review.rating, authorName: review.authorName, createdAtMs: review.createdAtMs,
      ...(typeof review.text === 'string' ? { text: review.text } : {}) });
  }
  const slots: PublicFreelancerPage['slots'] = [];
  for (const value of page.slots) {
    const slot = closedRecord(value, ['value', 'appointmentMode', 'serviceIds']);
    if (!slot || !futureSlot(slot.value, now) || (slot.appointmentMode !== 'home' && slot.appointmentMode !== 'chair')
      || !modes[slot.appointmentMode] || slots.some(existing => existing.value === slot.value)) return null;
    if (slot.serviceIds !== undefined && (!Array.isArray(slot.serviceIds) || !slot.serviceIds.length
      || slot.serviceIds.some(id => !services.some(service => service.id === id)))) return null;
    slots.push({ value: slot.value, appointmentMode: slot.appointmentMode,
      ...(Array.isArray(slot.serviceIds) ? { serviceIds: [...slot.serviceIds] as string[] } : {}) });
  }
  return {
    id: page.id, publicSlug: page.publicSlug, displayName: page.displayName, cityId: page.cityId,
    bio: page.bio, serviceSummary: page.serviceSummary,
    ...(typeof page.profileImageUrl === 'string' ? { profileImageUrl: page.profileImageUrl } : {}),
    portfolioUrls: [...page.portfolioUrls], services, workModes: { home: modes.home, chair: modes.chair },
    ...(workplace ? { workplace } : {}), socialLinks, cancellationWindowHours: page.cancellationWindowHours,
    travelFeeMinor: page.travelFeeMinor,
    reviewSummary: { average: typeof summary.average === 'number' ? summary.average : null, count: summary.count, reviews }, slots,
  };
}

const getPublicPage = httpsCallable<{ slug: string }, unknown>(functions, 'getPublicFreelancerPageBySlug');

export async function getPublicFreelancerPageBySlug(value: string): Promise<PublicFreelancerPage> {
  const slug = normalizePublicSlug(value);
  const result = await getPublicPage({ slug });
  const page = parsePublicFreelancerPage(result.data);
  if (!page || page.publicSlug !== slug) throw new Error('Invalid public freelancer response');
  return page;
}
