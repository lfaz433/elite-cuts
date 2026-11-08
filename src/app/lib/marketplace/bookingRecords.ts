import type { AppointmentMode, FreelancerWorkplace } from './freelancerRecords';

export type BookingStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'payment_failed';

export interface MarketplaceBooking {
  id: string;
  source: 'marketplace' | 'legacy';
  profileId: string;
  ownerId: string;
  ownerType: 'salon' | 'freelancer';
  clientId: string;
  clientName: string;
  serviceId: string;
  date: string;
  time: string;
  status: BookingStatus;
  appointmentMode: AppointmentMode;
  guestBooking: boolean;
  workplaceSnapshot?: FreelancerWorkplace;
  approximateArea?: string;
  clientEmail?: string;
  clientPhone?: string;
  servicePriceMinor?: number;
  travelFeeMinor?: number;
  totalPriceMinor?: number;
  durationMinutes?: number;
  serviceRadiusKm?: number;
  distanceKm?: number;
  cancellationWindowHours?: number;
  cancellationDeadlineMs?: number;
}

export interface SalonBookingWorkspace {
  locationId: string;
  configuredSlots: string[];
  availableSlots: string[];
  bookings: MarketplaceBooking[];
}

const BOOKING_STATUSES = new Set<BookingStatus>([
  'pending_approval', 'confirmed', 'declined', 'cancelled', 'completed', 'payment_failed',
]);

export function clientBookingScope(uid: string): [['clientId', '==', string]] {
  return [['clientId', '==', uid]];
}

function optionalNumber(record: Record<string, unknown>, field: string): number | undefined {
  return typeof record[field] === 'number' && Number.isFinite(record[field])
    ? record[field] as number
    : undefined;
}

function parseWorkplaceSnapshot(value: unknown): FreelancerWorkplace | null {
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

export function parseMarketplaceBooking(
  id: string,
  expectedClientId: string | null,
  value: unknown,
): MarketplaceBooking | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const booking = value as Record<string, unknown>;
  const appointmentMode = booking.appointmentMode === undefined ? 'home' : booking.appointmentMode;
  const guestBooking = booking.guestBooking === undefined ? false : booking.guestBooking;
  const workplaceSnapshot = appointmentMode === 'chair'
    ? parseWorkplaceSnapshot(booking.workplaceSnapshot)
    : null;
  if (
    typeof id !== 'string'
    || typeof booking.profileId !== 'string'
    || typeof booking.ownerId !== 'string'
    || (booking.ownerType !== 'salon' && booking.ownerType !== 'freelancer')
    || typeof booking.clientId !== 'string'
    || (expectedClientId !== null && booking.clientId !== expectedClientId)
    || typeof booking.clientName !== 'string'
    || typeof booking.serviceId !== 'string'
    || typeof booking.date !== 'string'
    || typeof booking.time !== 'string'
    || typeof booking.status !== 'string'
    || !BOOKING_STATUSES.has(booking.status as BookingStatus)
    || (appointmentMode !== 'home' && appointmentMode !== 'chair')
    || typeof guestBooking !== 'boolean'
    || (appointmentMode === 'chair' && !workplaceSnapshot)
    || (appointmentMode === 'home' && booking.workplaceSnapshot !== undefined)
  ) return null;
  const optionalText = (field: string) => typeof booking[field] === 'string'
    ? { [field]: booking[field] as string }
    : {};
  const optionalNumeric = (field: string) => {
    const number = optionalNumber(booking, field);
    return number === undefined ? {} : { [field]: number };
  };
  return {
    id,
    source: 'marketplace',
    profileId: booking.profileId,
    ownerId: booking.ownerId,
    ownerType: booking.ownerType,
    clientId: booking.clientId,
    clientName: booking.clientName,
    serviceId: booking.serviceId,
    date: booking.date,
    time: booking.time,
    status: booking.status as BookingStatus,
    appointmentMode,
    guestBooking,
    ...(workplaceSnapshot ? { workplaceSnapshot } : {}),
    ...optionalText('approximateArea'),
    ...optionalText('clientEmail'),
    ...optionalText('clientPhone'),
    ...optionalNumeric('servicePriceMinor'),
    ...optionalNumeric('travelFeeMinor'),
    ...optionalNumeric('totalPriceMinor'),
    ...optionalNumeric('durationMinutes'),
    ...optionalNumeric('serviceRadiusKm'),
    ...optionalNumeric('distanceKm'),
    ...optionalNumeric('cancellationWindowHours'),
    ...optionalNumeric('cancellationDeadlineMs'),
  };
}

function legacyStatus(value: unknown): BookingStatus | null {
  if (value === 'pending') return 'pending_approval';
  if (value === 'approved') return 'confirmed';
  if (value === 'rejected') return 'declined';
  if (value === 'archived') return 'completed';
  if (value === 'completed' || value === 'cancelled') return value;
  return null;
}

export function parseLegacyClientBooking(
  id: string,
  expectedClientId: string,
  value: unknown,
): MarketplaceBooking | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const booking = value as Record<string, unknown>;
  const status = legacyStatus(booking.status);
  const locationId = typeof booking.locationId === 'string'
    ? booking.locationId
    : typeof booking.tenantId === 'string' ? booking.tenantId : null;
  if (
    !locationId
    || booking.clientId !== expectedClientId
    || typeof booking.clientName !== 'string'
    || typeof booking.serviceId !== 'string'
    || typeof booking.date !== 'string'
    || typeof booking.time !== 'string'
    || !status
  ) return null;
  return {
    id,
    source: 'legacy',
    profileId: `salon__${locationId}`,
    ownerId: locationId,
    ownerType: 'salon',
    clientId: expectedClientId,
    clientName: booking.clientName,
    serviceId: booking.serviceId,
    date: booking.date,
    time: booking.time,
    status,
    appointmentMode: 'home',
    guestBooking: false,
  };
}

function slotList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(slot => (
    typeof slot === 'string'
    && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(slot)
  ));
}

export function parseSalonBookingWorkspace(
  value: unknown,
  requestedLocationId: string,
): SalonBookingWorkspace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const workspace = value as Record<string, unknown>;
  if (
    workspace.locationId !== requestedLocationId
    || !slotList(workspace.configuredSlots)
    || !slotList(workspace.availableSlots)
    || !Array.isArray(workspace.bookings)
  ) return null;
  const bookings = workspace.bookings.flatMap(rawBooking => {
    if (!rawBooking || typeof rawBooking !== 'object' || Array.isArray(rawBooking)) return [];
    const raw = rawBooking as Record<string, unknown>;
    const parsed = parseMarketplaceBooking(String(raw.id ?? ''), null, raw);
    return parsed
      && parsed.ownerType === 'salon'
      && parsed.ownerId === requestedLocationId
      && parsed.profileId === `salon__${requestedLocationId}`
      ? [parsed]
      : [];
  });
  return {
    locationId: requestedLocationId,
    configuredSlots: workspace.configuredSlots,
    availableSlots: workspace.availableSlots,
    bookings,
  };
}
