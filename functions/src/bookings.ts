import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { europeFunctions } from './runtime';
import { normalizePublicSlug, AppointmentMode, FreelancerWorkplace } from './freelancers';
import { isReferralEligibleCompletion } from './bookingStatus';
import { processReferralBookingCompletion } from './referrals';
import { freeSlot, intervalIsFree, minimumServiceDuration, storedIntervals, type ReservedInterval } from './freelancerAvailability';

export type MarketplaceBookingStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'payment_failed';

export interface MarketplaceOwner {
  type: 'salon' | 'freelancer';
  bookingPolicy?: 'automatic' | 'manual';
}

export interface HomeAddress {
  line1: string;
  city: string;
  postalCode?: string;
}

export interface MarketplaceBookingInput {
  profileId: string;
  serviceId: string;
  date: string;
  time: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  approximateArea?: string;
  homeAddress?: HomeAddress;
}

export interface PublicFreelancerBookingInput {
  publicSlug: string;
  serviceId: string;
  appointmentMode: AppointmentMode;
  date: string;
  time: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  approximateArea?: string;
  homeAddress?: HomeAddress;
  clientRequestId: string;
}

export interface Booking {
  id: string;
  ownerId: string;
  ownerType: 'salon' | 'freelancer';
  clientId: string;
  serviceId: string;
  date: string;
  time: string;
  status: MarketplaceBookingStatus;
  address?: HomeAddress;
}

type RecordValue = Record<string, unknown>;
type Firestore = admin.firestore.Firestore;

export const processCompletedBookingReferralFunction = europeFunctions.firestore
  .document('bookings/{bookingId}')
  .onUpdate(async (change, context) => {
    const previousStatus = change.before.data()?.status;
    const nextBooking = change.after.data();
    const nextStatus = nextBooking?.status;
    if (!isReferralEligibleCompletion(previousStatus, nextStatus) || nextBooking?.isTest !== false) return null;
    const updateTimeMs = change.after.updateTime?.toMillis();
    if (
      !Number.isSafeInteger(updateTimeMs)
      || typeof context.eventId !== 'string' || context.eventId.length === 0
    ) return null;

    return processReferralBookingCompletion(
      context.params.bookingId,
      admin.firestore(),
      new Date(),
      { version: 1, eventId: context.eventId, updateTimeMs },
    );
  });

const allowedTransitions: Record<MarketplaceBookingStatus, readonly MarketplaceBookingStatus[]> = {
  pending_approval: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['cancelled', 'completed', 'payment_failed'],
  declined: [],
  cancelled: [],
  completed: [],
  payment_failed: ['confirmed', 'cancelled'],
};
const BOOKING_STATUSES = new Set<MarketplaceBookingStatus>(Object.keys(allowedTransitions) as MarketplaceBookingStatus[]);

function locationMembershipId(brandId: string, locationId: string, userId: string): string {
  return `${brandId}__${locationId}__${userId}`;
}

function canManageSalonBookings(
  callerUid: string,
  brandId: string,
  locationId: string,
  principal: admin.firestore.DocumentData | undefined,
  membership: admin.firestore.DocumentData | undefined,
): boolean {
  const principalAllowed = principal?.userId === callerUid
    && principal.brandId === brandId
    && principal.role === 'principal_admin'
    && principal.status === 'active';
  const membershipAllowed = membership?.userId === callerUid
    && membership.brandId === brandId
    && membership.locationId === locationId
    && membership.status === 'active'
    && (membership.permissions as RecordValue | undefined)?.manageBookings === true;
  return principalAllowed || membershipAllowed;
}

export function transition(
  from: MarketplaceBookingStatus,
  to: MarketplaceBookingStatus,
): MarketplaceBookingStatus {
  if (!allowedTransitions[from]?.includes(to)) {
    throw new Error(`Invalid booking transition: ${from} -> ${to}`);
  }
  return to;
}

export function initialBookingStatus(owner: MarketplaceOwner): 'confirmed' | 'pending_approval' {
  return owner.type === 'freelancer' || owner.bookingPolicy === 'manual'
    ? 'pending_approval'
    : 'confirmed';
}

export function redactAddress<T extends HomeAddress>(
  status: MarketplaceBookingStatus,
  address: T | undefined,
): T | undefined {
  return status === 'confirmed' ? address : undefined;
}

function requireText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maximum) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return value.trim();
}

function documentId(value: unknown, field: string): string {
  const id = requireText(value, field, 256);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return id;
}

function slotList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'configuredSlots is invalid');
  }
  const slots = value.map(slot => requireText(slot, 'configuredSlots', 16));
  if (
    slots.some(slot => !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(slot))
    || new Set(slots).size !== slots.length
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'configuredSlots is invalid');
  }
  return slots.sort();
}

function optionalText(value: unknown, field: string, maximum: number): string | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : requireText(value, field, maximum);
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, date] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}

function parseHomeAddress(value: unknown): HomeAddress | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'homeAddress is invalid');
  }
  const address = value as RecordValue;
  if (Object.keys(address).some(key => !['line1', 'city', 'postalCode'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'homeAddress is invalid');
  }
  return {
    line1: requireText(address.line1, 'homeAddress.line1', 240),
    city: requireText(address.city, 'homeAddress.city', 120),
    ...(optionalText(address.postalCode, 'homeAddress.postalCode', 32)
      ? { postalCode: optionalText(address.postalCode, 'homeAddress.postalCode', 32) }
      : {}),
  };
}

export function parseMarketplaceBookingInput(value: unknown): MarketplaceBookingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking data is required');
  }
  const input = value as RecordValue;
  const allowed = new Set([
    'profileId', 'serviceId', 'date', 'time', 'clientName', 'clientEmail', 'clientPhone',
    'approximateArea', 'homeAddress',
  ]);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Server-owned booking fields cannot be supplied');
  }
  const profileId = requireText(input.profileId, 'profileId', 256);
  if (!/^(salon|freelancer)__[A-Za-z0-9_-]{1,128}$/.test(profileId)) {
    throw new functions.https.HttpsError('invalid-argument', 'profileId is invalid');
  }
  const date = requireText(input.date, 'date', 10);
  const time = requireText(input.time, 'time', 5);
  if (!isDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking date or time is invalid');
  }
  return {
    profileId,
    serviceId: requireText(input.serviceId, 'serviceId', 128),
    date,
    time,
    clientName: requireText(input.clientName, 'clientName', 120),
    ...(optionalText(input.clientEmail, 'clientEmail', 254) ? { clientEmail: optionalText(input.clientEmail, 'clientEmail', 254) } : {}),
    ...(optionalText(input.clientPhone, 'clientPhone', 40) ? { clientPhone: optionalText(input.clientPhone, 'clientPhone', 40) } : {}),
    ...(optionalText(input.approximateArea, 'approximateArea', 120) ? { approximateArea: optionalText(input.approximateArea, 'approximateArea', 120) } : {}),
    ...(parseHomeAddress(input.homeAddress) ? { homeAddress: parseHomeAddress(input.homeAddress) } : {}),
  };
}

export function parsePublicFreelancerBookingInput(value: unknown): PublicFreelancerBookingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Public booking data is required');
  }
  const input = value as RecordValue;
  const allowed = new Set([
    'publicSlug', 'serviceId', 'appointmentMode', 'date', 'time', 'clientName', 'clientEmail',
    'clientPhone', 'approximateArea', 'homeAddress', 'clientRequestId',
  ]);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Unexpected public booking fields');
  }
  if (input.appointmentMode !== 'home' && input.appointmentMode !== 'chair') {
    throw new functions.https.HttpsError('invalid-argument', 'appointmentMode is invalid');
  }
  if (input.appointmentMode === 'chair' && Object.prototype.hasOwnProperty.call(input, 'homeAddress')) {
    throw new functions.https.HttpsError('invalid-argument', 'A chair booking cannot include a home address');
  }
  const homeAddress = parseHomeAddress(input.homeAddress);
  if (input.appointmentMode === 'home' && !homeAddress) {
    throw new functions.https.HttpsError('invalid-argument', 'A home address is required');
  }
  const date = requireText(input.date, 'date', 10);
  const time = requireText(input.time, 'time', 5);
  if (!isDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking date or time is invalid');
  }
  const clientRequestId = requireText(input.clientRequestId, 'clientRequestId', 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clientRequestId)) {
    throw new functions.https.HttpsError('invalid-argument', 'clientRequestId must be a UUID');
  }
  const clientEmail = requireText(input.clientEmail, 'clientEmail', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    throw new functions.https.HttpsError('invalid-argument', 'clientEmail is invalid');
  }
  const approximateArea = optionalText(input.approximateArea, 'approximateArea', 120);
  // Stable field order lets retries compare normalized immutable input.
  return {
    publicSlug: normalizePublicSlug(requireText(input.publicSlug, 'publicSlug', 128)),
    serviceId: documentId(requireText(input.serviceId, 'serviceId', 128), 'serviceId'),
    appointmentMode: input.appointmentMode, date, time,
    clientName: requireText(input.clientName, 'clientName', 120), clientEmail,
    clientPhone: requireText(input.clientPhone, 'clientPhone', 40),
    ...(approximateArea ? { approximateArea } : {}), ...(homeAddress ? { homeAddress } : {}), clientRequestId,
  };
}

function profileOwner(profileId: string): { type: 'salon' | 'freelancer'; ownerId: string } {
  return profileId.startsWith('salon__')
    ? { type: 'salon', ownerId: profileId.slice('salon__'.length) }
    : { type: 'freelancer', ownerId: profileId.slice('freelancer__'.length) };
}

function hasAvailableSlot(value: unknown, slot: string): value is RecordValue & { availableSlots: string[] } {
  if (!value || typeof value !== 'object') return false;
  const slots = (value as RecordValue).availableSlots;
  return Array.isArray(slots) && slots.every((item: unknown) => typeof item === 'string') && slots.includes(slot);
}

function availabilitySlots(value: RecordValue | undefined, field: 'availableSlots' | 'reservedSlots'): string[] {
  const slots = value?.[field];
  return Array.isArray(slots) ? slots.filter((slot): slot is string => typeof slot === 'string') : [];
}

function configuredAvailabilitySlots(value: RecordValue | undefined): string[] | undefined {
  if (!value || !Object.prototype.hasOwnProperty.call(value, 'configuredSlots')) return undefined;
  const slots = value?.configuredSlots;
  return Array.isArray(slots) ? slots.filter((slot): slot is string => typeof slot === 'string') : [];
}

function configuredAvailabilitySlotsForWorkspace(value: RecordValue | undefined): string[] {
  const configured = configuredAvailabilitySlots(value);
  return configured === undefined
    ? [...new Set([
      ...availabilitySlots(value, 'availableSlots'),
      ...availabilitySlots(value, 'reservedSlots'),
    ])].sort()
    : [...new Set(configured)].sort();
}

function reserveAvailability(value: RecordValue, slot: string) {
  return {
    availableSlots: availabilitySlots(value, 'availableSlots').filter(candidate => candidate !== slot),
    reservedSlots: [...new Set([...availabilitySlots(value, 'reservedSlots'), slot])].sort(),
  };
}

function configuredForAppointmentMode(
  profile: RecordValue | undefined,
  mode: AppointmentMode,
  slot: string,
): boolean {
  const modes = profile?.workModes as RecordValue | undefined;
  const enabled = modes === undefined ? mode === 'home' : modes?.[mode] === true;
  const slots = profile?.availabilityByMode === undefined && mode === 'home'
    ? profile?.availability : (profile?.availabilityByMode as RecordValue | undefined)?.[mode];
  return enabled && Array.isArray(slots) && slots.includes(slot);
}

function releaseAvailability(
  value: RecordValue | undefined,
  slot: string,
  booking?: RecordValue,
  profile?: RecordValue,
) {
  const configuredSlots = configuredAvailabilitySlots(value);
  // Historical freelancer bookings predate appointmentMode and are home visits,
  // matching the legacy default in the booking reader.
  const storedMode = booking?.appointmentMode;
  const mode = storedMode === undefined ? 'home' : storedMode;
  const modeBooking = booking?.ownerType === 'freelancer' && (mode === 'home' || mode === 'chair');
  // A reservation retains its original modeBySlot while the owner can change
  // the desired schedule. Both records must still agree before reopening it.
  const matchesMode = (candidate: string, appointmentMode: AppointmentMode) => (
    (configuredSlots === undefined || configuredSlots.includes(candidate))
    && (value?.modeBySlot === undefined ? appointmentMode === 'home'
      : (value.modeBySlot as RecordValue)?.[candidate] === appointmentMode)
    && configuredForAppointmentMode(profile, appointmentMode, candidate)
  );
  const shouldRestore = modeBooking ? matchesMode(slot, mode) : configuredSlots === undefined || configuredSlots.includes(slot);
  const previousIntervals = storedIntervals(value?.reservedIntervals);
  const remainingIntervals = previousIntervals.filter(interval => interval.slot !== slot);
  const releasedInterval = previousIntervals.find(interval => interval.slot === slot);
  const restored = shouldRestore ? [slot] : [];
  // Reopen only starts blocked by this reservation, still configured in their
  // own mode and clear of every remaining reservation.
  if (modeBooking && releasedInterval) for (const candidate of configuredSlots ?? []) {
    const candidateMode = (value?.modeBySlot as RecordValue | undefined)?.[candidate];
    if ((candidateMode === 'home' || candidateMode === 'chair') && matchesMode(candidate, candidateMode)
      && !freeSlot(candidate, minimumServiceDuration(profile?.serviceDurationMinutes), [releasedInterval])
      && freeSlot(candidate, minimumServiceDuration(profile?.serviceDurationMinutes), remainingIntervals)) restored.push(candidate);
  }
  return {
    availableSlots: [...new Set([...availabilitySlots(value, 'availableSlots'), ...restored])].filter(candidate =>
      !modeBooking || freeSlot(candidate, minimumServiceDuration(profile?.serviceDurationMinutes), remainingIntervals)).sort(),
    reservedSlots: availabilitySlots(value, 'reservedSlots').filter(candidate => candidate !== slot),
    ...(value?.reservedIntervals === undefined ? {} : { reservedIntervals: remainingIntervals }),
  };
}

export async function saveSalonAvailability(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ locationId: string; configuredSlots: string[]; availableSlots: string[] }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Salon availability is required');
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !['locationId', 'configuredSlots'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Salon availability is invalid');
  }
  const locationId = documentId(input.locationId, 'locationId');
  const configuredSlots = slotList(input.configuredSlots);
  const locationRef = firestore.collection('salonLocations').doc(locationId);
  const initialLocation = await locationRef.get();
  const initialData = initialLocation.data() as RecordValue | undefined;
  if (!initialLocation.exists || typeof initialData?.brandId !== 'string') {
    throw new functions.https.HttpsError('not-found', 'Salon location not found');
  }
  const brandId = initialData.brandId;
  const principalRef = firestore.collection('memberships').doc(`${brandId}__principal__${callerUid}`);
  const membershipRef = firestore.collection('memberships').doc(
    locationMembershipId(brandId, locationId, callerUid),
  );
  const availabilityRef = firestore.collection('availability').doc(locationId);
  const auditRef = firestore.collection('auditEvents').doc();
  let availableSlots: string[] = [];
  await firestore.runTransaction(async transaction => {
    const [locationSnapshot, principalSnapshot, membershipSnapshot, availabilitySnapshot] = (
      await transaction.getAll(locationRef, principalRef, membershipRef, availabilityRef)
    );
    const location = locationSnapshot.data() as RecordValue | undefined;
    if (
      !locationSnapshot.exists
      || location?.brandId !== brandId
      || !canManageSalonBookings(
        callerUid,
        brandId,
        locationId,
        principalSnapshot.data(),
        membershipSnapshot.data(),
      )
    ) {
      throw new functions.https.HttpsError('permission-denied', 'Permission denied');
    }
    const existing = availabilitySnapshot.data() as RecordValue | undefined;
    const reservedSlots = [...new Set(availabilitySlots(existing, 'reservedSlots'))].sort();
    const reserved = new Set(reservedSlots);
    availableSlots = configuredSlots.filter(slot => !reserved.has(slot));
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(availabilityRef, {
      ownerId: locationId,
      ownerType: 'salon',
      configuredSlots,
      availableSlots,
      reservedSlots,
      updatedAt: now,
    });
    transaction.create(auditRef, {
      action: 'SALON_AVAILABILITY_UPDATED', actorUid: callerUid, brandId, locationId,
      availableSlotCount: availableSlots.length, createdAt: now,
    });
  });
  return { locationId, configuredSlots, availableSlots };
}

export async function listSalonBookingWorkspace(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{
  locationId: string;
  configuredSlots: string[];
  availableSlots: string[];
  bookings: Array<RecordValue & { id: string }>;
}> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'locationId is required');
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => key !== 'locationId')) {
    throw new functions.https.HttpsError('invalid-argument', 'locationId is invalid');
  }
  const locationId = documentId(input.locationId, 'locationId');
  const locationRef = firestore.collection('salonLocations').doc(locationId);
  const locationSnapshot = await locationRef.get();
  const location = locationSnapshot.data() as RecordValue | undefined;
  if (!locationSnapshot.exists || typeof location?.brandId !== 'string') {
    throw new functions.https.HttpsError('not-found', 'Salon location not found');
  }
  const brandId = location.brandId;
  const [principal, membership, availability, bookings] = await Promise.all([
    firestore.collection('memberships').doc(`${brandId}__principal__${callerUid}`).get(),
    firestore.collection('memberships').doc(locationMembershipId(brandId, locationId, callerUid)).get(),
    firestore.collection('availability').doc(locationId).get(),
    firestore.collection('bookingRequests').where('locationId', '==', locationId).get(),
  ]);
  if (!canManageSalonBookings(callerUid, brandId, locationId, principal.data(), membership.data())) {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }
  const scopedBookings = bookings.docs.flatMap(document => {
    const booking = document.data() as RecordValue;
    if (
      booking.ownerType !== 'salon'
      || booking.ownerId !== locationId
      || booking.locationId !== locationId
      || booking.brandId !== brandId
      || booking.profileId !== `salon__${locationId}`
      || typeof booking.clientId !== 'string'
      || typeof booking.clientName !== 'string'
      || typeof booking.serviceId !== 'string'
      || typeof booking.date !== 'string'
      || typeof booking.time !== 'string'
      || typeof booking.status !== 'string'
      || !BOOKING_STATUSES.has(booking.status as MarketplaceBookingStatus)
    ) return [];
    return [{
      id: document.id,
      profileId: booking.profileId,
      ownerId: locationId,
      ownerType: 'salon',
      clientId: booking.clientId,
      clientName: booking.clientName,
      serviceId: booking.serviceId,
      date: booking.date,
      time: booking.time,
      status: booking.status,
      ...(typeof booking.clientEmail === 'string' ? { clientEmail: booking.clientEmail } : {}),
      ...(typeof booking.clientPhone === 'string' ? { clientPhone: booking.clientPhone } : {}),
    }];
  }).sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`));
  return {
    locationId,
    configuredSlots: configuredAvailabilitySlotsForWorkspace(
      availability.data() as RecordValue | undefined,
    ),
    availableSlots: availabilitySlots(availability.data() as RecordValue | undefined, 'availableSlots'),
    bookings: scopedBookings,
  };
}

function ownerPolicy(value: unknown): 'automatic' | 'manual' {
  const owner = value as RecordValue | undefined;
  return owner?.bookingPolicy === 'automatic' || owner?.settings && (owner.settings as RecordValue).bookingPolicy === 'automatic'
    ? 'automatic'
    : 'manual';
}

const PARIS_TIME_ZONE = 'Europe/Paris';

function parisWallTimeParts(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs)).reduce((value, part) => (
    ['year', 'month', 'day', 'hour', 'minute'].includes(part.type)
      ? `${value}${part.type}:${part.value};`
      : value
  ), '');
}

export function appointmentEpochMsInParis(date: string, time: string): number {
  if (!isDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new functions.https.HttpsError('invalid-argument', 'Appointment date or time is invalid');
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = `year:${String(year).padStart(4, '0')};month:${String(month).padStart(2, '0')};day:${String(day).padStart(2, '0')};hour:${String(hour).padStart(2, '0')};minute:${String(minute).padStart(2, '0')};`;
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const candidates: number[] = [];
  for (let deltaMinutes = -180; deltaMinutes <= 180; deltaMinutes += 15) {
    const candidate = wallTimeAsUtc + deltaMinutes * 60_000;
    if (parisWallTimeParts(candidate) === target) candidates.push(candidate);
  }
  if (candidates.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Appointment time ${date} ${time} does not exist in Europe/Paris`,
    );
  }
  if (candidates.length > 1) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Appointment time ${date} ${time} is ambiguous in Europe/Paris`,
    );
  }
  return Math.min(...candidates);
}

export function cancellationDeadlineMsInParis(
  date: string,
  time: string,
  cancellationWindowHours: number,
): number {
  return appointmentEpochMsInParis(date, time) - cancellationWindowHours * 60 * 60 * 1000;
}

function cancellationDeadlineForBooking(booking: RecordValue): number | undefined {
  if (
    typeof booking.date === 'string'
    && typeof booking.time === 'string'
    && Number.isInteger(booking.cancellationWindowHours)
    && (booking.cancellationWindowHours as number) >= 0
    && (booking.cancellationWindowHours as number) <= 720
  ) {
    try {
      return cancellationDeadlineMsInParis(
        booking.date,
        booking.time,
        booking.cancellationWindowHours as number,
      );
    } catch {
      // An invalid/ambiguous historical appointment must not trap the client.
      return undefined;
    }
  }
  return typeof booking.cancellationDeadlineMs === 'number'
    && Number.isFinite(booking.cancellationDeadlineMs)
    ? booking.cancellationDeadlineMs
    : undefined;
}

function bookingRecord(
  id: string,
  value: RecordValue,
  address?: HomeAddress,
): Booking {
  return {
    id,
    ownerId: String(value.ownerId),
    ownerType: value.ownerType as 'salon' | 'freelancer',
    clientId: String(value.clientId),
    serviceId: String(value.serviceId),
    date: String(value.date),
    time: String(value.time),
    status: value.status as MarketplaceBookingStatus,
    ...(redactAddress(value.status as MarketplaceBookingStatus, address)
      ? { address: redactAddress(value.status as MarketplaceBookingStatus, address) }
      : {}),
  };
}

function storedRecord(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}

function bookingSnapshotInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new functions.https.HttpsError('failed-precondition', 'Professional booking details are unavailable');
  }
  return value;
}

function commercialWorkplace(value: unknown): FreelancerWorkplace {
  const place = storedRecord(value);
  if (!place || Object.keys(place).some(key => !['name', 'line1', 'postalCode', 'city'].includes(key))) {
    throw new functions.https.HttpsError('failed-precondition', 'Commercial workplace is unavailable');
  }
  try {
    return {
      name: requireText(place.name, 'workplace.name', 160),
      line1: requireText(place.line1, 'workplace.line1', 240),
      postalCode: requireText(place.postalCode, 'workplace.postalCode', 20),
      city: requireText(place.city, 'workplace.city', 120),
    };
  } catch {
    throw new functions.https.HttpsError('failed-precondition', 'Commercial workplace is unavailable');
  }
}

export async function createPublicFreelancerBooking(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ bookingId: string; status: MarketplaceBookingStatus }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(callerUid)) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid booking session');
  }
  const input = parsePublicFreelancerBookingInput(value);
  const { homeAddress, ...sharedInput } = input;
  // Do not expose even a digest of a guessable street address to the owner
  // before approval. Home retries compare the private address separately.
  const requestFingerprint = createHash('sha256').update(JSON.stringify(sharedInput)).digest('hex');
  const bookingRef = firestore.collection('bookingRequests').doc(`${callerUid}_${input.clientRequestId}`);
  const slugRef = firestore.collection('publicProfileSlugs').doc(input.publicSlug);
  const privateRef = firestore.collection('bookingRequestPrivate').doc(bookingRef.id);
  const auditRef = firestore.collection('auditEvents').doc();
  const slot = `${input.date}T${input.time}`;
  const notAvailable = () => new functions.https.HttpsError('not-found', 'This professional is not available for booking');

  return firestore.runTransaction<{ bookingId: string; status: MarketplaceBookingStatus }>(async transaction => {
    // Recover a committed request even after time passes or a slug changes.
    const [existingSnapshot] = await transaction.getAll(bookingRef);
    const existing = existingSnapshot.data() as RecordValue | undefined;
    if (existingSnapshot.exists) {
      if (!existing || existing.clientId !== callerUid || existing.guestBooking !== true
        || existing.clientRequestId !== input.clientRequestId || existing.requestFingerprint !== requestFingerprint) {
        throw new functions.https.HttpsError('already-exists', 'This client request id was already used for different booking details');
      }
      if (homeAddress) {
        const [privateSnapshot] = await transaction.getAll(privateRef);
        const privateBooking = storedRecord(privateSnapshot.data());
        const address = storedRecord(privateBooking?.address);
        if (!privateSnapshot.exists || privateBooking?.clientId !== callerUid
          || address?.line1 !== homeAddress.line1 || address?.city !== homeAddress.city
          || address?.postalCode !== homeAddress.postalCode) {
          throw new functions.https.HttpsError('already-exists', 'This client request id was already used for different booking details');
        }
      }
      if (typeof existing.status !== 'string' || !BOOKING_STATUSES.has(existing.status as MarketplaceBookingStatus)) {
        throw new functions.https.HttpsError('failed-precondition', 'Saved booking status is invalid');
      }
      return { bookingId: bookingRef.id, status: existing.status as MarketplaceBookingStatus };
    }

    // Use the public resolver's server-owned slug/projection contract inside
    // this transaction, so ownership cannot change during reservation.
    const [slugSnapshot] = await transaction.getAll(slugRef);
    const index = storedRecord(slugSnapshot.data());
    if (!slugSnapshot.exists || typeof index?.freelancerId !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(index.freelancerId)
      || index.profileId !== `freelancer__${index.freelancerId}`) throw notAvailable();
    const ownerId = index.freelancerId;
    const profileId = `freelancer__${ownerId}`;
    const profileRef = firestore.collection('publicProfiles').doc(profileId);
    const ownerRef = firestore.collection('freelancerProfiles').doc(ownerId);
    const availabilityRef = firestore.collection('availability').doc(ownerId);
    const [profileSnapshot, ownerSnapshot, availabilitySnapshot] = await transaction.getAll(profileRef, ownerRef, availabilityRef);
    const projection = storedRecord(profileSnapshot.data());
    const owner = storedRecord(ownerSnapshot.data());
    const availability = storedRecord(availabilitySnapshot.data());
    const approvalAllowed = (status: unknown) => status === 'approved' || status === 'pending';
    if (!profileSnapshot.exists || projection?.kind !== 'freelancer' || projection.visible !== true
      || projection.publicSlug !== input.publicSlug || !approvalAllowed(projection.approvalStatus)
      || !Array.isArray(projection.serviceIds) || !projection.serviceIds.includes(input.serviceId)
      || !Array.isArray(projection.services) || !projection.services.some(value => storedRecord(value)?.id === input.serviceId)
      || storedRecord(projection.workModes)?.[input.appointmentMode] !== true
      || !ownerSnapshot.exists || !owner || owner.uid !== ownerId || owner.visible !== true
      || storedRecord(owner.identity)?.publicSlug !== input.publicSlug
      || !approvalAllowed(storedRecord(owner.publicProfile)?.approvalStatus)
      || !Array.isArray(owner.serviceIds) || !owner.serviceIds.includes(input.serviceId)) throw notAvailable();
    if (!availabilitySnapshot.exists || !availability || availability.ownerId !== ownerId || availability.ownerType !== 'freelancer'
      || !hasAvailableSlot(availability, slot) || !Array.isArray(availability.reservedSlots)
      || availability.reservedSlots.some(value => typeof value !== 'string') || availability.reservedSlots.includes(slot)
      || !configuredAvailabilitySlots(availability)?.includes(slot)
      || storedRecord(availability.modeBySlot)?.[slot] !== input.appointmentMode
      || !configuredForAppointmentMode(owner, input.appointmentMode, slot)) {
      throw new functions.https.HttpsError('failed-precondition', 'This time is no longer available');
    }
    const appointmentEpochMs = appointmentEpochMsInParis(input.date, input.time);
    if (!Number.isFinite(currentTime.getTime()) || appointmentEpochMs <= currentTime.getTime()) {
      throw new functions.https.HttpsError('failed-precondition', 'This appointment time has passed');
    }
    const servicePriceMinor = bookingSnapshotInteger(storedRecord(owner.servicePricesMinor)?.[input.serviceId], 0, 1_000_000);
    const durationMinutes = bookingSnapshotInteger(storedRecord(owner.serviceDurationMinutes)?.[input.serviceId], 15, 360);
    // Read authoritative booking snapshots in the reservation transaction.
    // The shared availability write serializes competing requests across modes.
    const existingBookings = await transaction.get(firestore.collection('bookingRequests').where('ownerId', '==', ownerId));
    const intervals: ReservedInterval[] = existingBookings.docs.flatMap(document => {
      const booking = document.data();
      if (booking.ownerType !== 'freelancer' || ['declined', 'cancelled'].includes(booking.status)) return [];
      const startMs = appointmentEpochMsInParis(booking.date, booking.time);
      const duration = bookingSnapshotInteger(booking.durationMinutes ?? booking.serviceDurationMinutes ?? 30, 15, 360);
      return [{ slot: `${booking.date}T${booking.time}`, startMs, endMs: startMs + duration * 60_000 }];
    });
    if (!intervalIsFree(appointmentEpochMs, durationMinutes, intervals)) {
      throw new functions.https.HttpsError('failed-precondition', 'This time is no longer available');
    }
    intervals.push({ slot, startMs: appointmentEpochMs, endMs: appointmentEpochMs + durationMinutes * 60_000 });
    const cancellationWindowHours = bookingSnapshotInteger(owner.cancellationWindowHours, 0, 720);
    const locationDetails = input.appointmentMode === 'home'
      ? { travelFeeMinor: bookingSnapshotInteger(owner.travelFeeMinor, 0, 1_000_000) }
      : { workplaceSnapshot: commercialWorkplace(owner.workplace) };
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.create(bookingRef, {
      profileId, publicSlug: input.publicSlug, ownerId, ownerType: 'freelancer', clientId: callerUid,
      guestBooking: true, clientRequestId: input.clientRequestId, requestFingerprint,
      serviceId: input.serviceId, appointmentMode: input.appointmentMode, date: input.date, time: input.time,
      clientName: input.clientName, clientEmail: input.clientEmail, clientPhone: input.clientPhone,
      ...(input.approximateArea ? { approximateArea: input.approximateArea } : {}),
      servicePriceMinor, totalPriceMinor: servicePriceMinor + (locationDetails.travelFeeMinor ?? 0),
      durationMinutes, cancellationWindowHours, appointmentEpochMs,
      cancellationDeadlineMs: appointmentEpochMs - cancellationWindowHours * 60 * 60 * 1000,
      ...locationDetails, status: 'pending_approval', addressReleased: false,
      createdAt: now, statusUpdatedAt: now, statusUpdatedBy: callerUid,
    });
    transaction.update(availabilityRef, {
      ...reserveAvailability(availability, slot), reservedIntervals: intervals,
      availableSlots: availabilitySlots(availability, 'availableSlots').filter(candidate =>
        freeSlot(candidate, minimumServiceDuration(owner.serviceDurationMinutes), intervals)),
    });
    if (input.homeAddress) {
      transaction.create(privateRef, { clientId: callerUid, address: input.homeAddress, createdAt: now });
    }
    transaction.create(auditRef, {
      action: 'PUBLIC_FREELANCER_BOOKING_REQUESTED', actorUid: callerUid, bookingId: bookingRef.id,
      ownerId, ownerType: 'freelancer', appointmentMode: input.appointmentMode, status: 'pending_approval', createdAt: now,
    });
    return { bookingId: bookingRef.id, status: 'pending_approval' };
  });
}

export async function createMarketplaceBooking(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ bookingId: string; status: 'confirmed' | 'pending_approval' }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const input = parseMarketplaceBookingInput(value);
  const owner = profileOwner(input.profileId);
  const bookingRef = firestore.collection('bookingRequests').doc();
  const privateRef = firestore.collection('bookingRequestPrivate').doc(bookingRef.id);
  const profileRef = firestore.collection('publicProfiles').doc(input.profileId);
  const ownerRef = firestore.collection(owner.type === 'salon' ? 'salonLocations' : 'freelancerProfiles').doc(owner.ownerId);
  const availabilityRef = firestore.collection('availability').doc(owner.ownerId);
  const auditRef = firestore.collection('auditEvents').doc();
  const slot = `${input.date}T${input.time}`;
  let status: 'confirmed' | 'pending_approval' = 'pending_approval';

  await firestore.runTransaction(async transaction => {
    const [profileSnapshot, ownerSnapshot, availabilitySnapshot] = await transaction.getAll(
      profileRef, ownerRef, availabilityRef,
    );
    const profile = profileSnapshot.data() as RecordValue | undefined;
    if (
      !profileSnapshot.exists
      || profile?.kind !== owner.type
      || profile.visible !== true
      || profile.approvalStatus !== 'approved'
      || !Array.isArray(profile.serviceIds)
      || !profile.serviceIds.includes(input.serviceId)
    ) {
      throw new functions.https.HttpsError('not-found', 'This professional is not available for booking');
    }
    if (!ownerSnapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Booking owner not found');
    }
    if (!hasAvailableSlot(availabilitySnapshot.data(), slot)) {
      throw new functions.https.HttpsError('failed-precondition', 'This time is no longer available');
    }
    if (owner.type === 'freelancer' && profile.homeVisit !== true) {
      throw new functions.https.HttpsError('failed-precondition', 'Home visits are not available for this professional');
    }
    if (owner.type === 'freelancer' && !input.homeAddress) {
      throw new functions.https.HttpsError('invalid-argument', 'A home address is required for a home visit');
    }
    if (owner.type === 'freelancer') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This home visit cannot be verified until trusted address geocoding and a verified professional origin are configured',
      );
    }
    if (owner.type === 'salon' && input.homeAddress) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'A salon booking cannot include a home address',
      );
    }
    status = initialBookingStatus({ type: owner.type, bookingPolicy: ownerPolicy(ownerSnapshot.data()) });
    transaction.update(
      availabilityRef,
      reserveAvailability(availabilitySnapshot.data() as RecordValue, slot),
    );
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ownerData = ownerSnapshot.data() as RecordValue;
    transaction.create(bookingRef, {
      profileId: input.profileId,
      ownerId: owner.ownerId,
      ownerType: owner.type,
      ...(typeof ownerData.brandId === 'string' ? { brandId: ownerData.brandId } : {}),
      ...(owner.type === 'salon' ? { locationId: owner.ownerId } : {}),
      clientId: callerUid,
      serviceId: input.serviceId,
      date: input.date,
      time: input.time,
      clientName: input.clientName,
      ...(input.clientEmail ? { clientEmail: input.clientEmail } : {}),
      ...(input.clientPhone ? { clientPhone: input.clientPhone } : {}),
      ...(input.approximateArea ? { approximateArea: input.approximateArea } : {}),
      status,
      addressReleased: false,
      createdAt: now,
      statusUpdatedAt: now,
      statusUpdatedBy: callerUid,
    });
    if (input.homeAddress) {
      transaction.create(privateRef, { clientId: callerUid, address: input.homeAddress, createdAt: now });
    }
    transaction.create(auditRef, {
      action: 'MARKETPLACE_BOOKING_REQUESTED', actorUid: callerUid, bookingId: bookingRef.id,
      ownerId: owner.ownerId, ownerType: owner.type, status, createdAt: now,
    });
  });
  return { bookingId: bookingRef.id, status };
}

export async function respondToMarketplaceBooking(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<Booking> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking response is required');
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !['bookingId', 'decision'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking response is invalid');
  }
  const bookingId = requireText(input.bookingId, 'bookingId', 256);
  if (input.decision !== 'accept' && input.decision !== 'decline') {
    throw new functions.https.HttpsError('invalid-argument', 'decision is invalid');
  }
  const bookingRef = firestore.collection('bookingRequests').doc(bookingId);
  const privateRef = firestore.collection('bookingRequestPrivate').doc(bookingId);
  const auditRef = firestore.collection('auditEvents').doc();
  const initialBooking = await bookingRef.get();
  const initialData = initialBooking.data() as RecordValue | undefined;
  if (!initialBooking.exists || !initialData) {
    throw new functions.https.HttpsError('not-found', 'Booking not found');
  }
  if (
    (initialData.ownerType !== 'salon' && initialData.ownerType !== 'freelancer')
    || typeof initialData.ownerId !== 'string'
  ) {
    throw new functions.https.HttpsError('failed-precondition', 'Booking owner scope is invalid');
  }
  let principalRef: admin.firestore.DocumentReference | null = null;
  let staffMembershipRef: admin.firestore.DocumentReference | null = null;
  if (initialData.ownerType === 'salon') {
    if (
      typeof initialData.brandId !== 'string'
      || typeof initialData.ownerId !== 'string'
      || initialData.locationId !== initialData.ownerId
    ) {
      throw new functions.https.HttpsError('failed-precondition', 'Booking salon scope is invalid');
    }
    principalRef = firestore.collection('memberships').doc(
      `${initialData.brandId}__principal__${callerUid}`,
    );
    staffMembershipRef = firestore.collection('memberships').doc(locationMembershipId(
      initialData.brandId,
      initialData.ownerId,
      callerUid,
    ));
  }
  let response: Booking | undefined;

  await firestore.runTransaction(async transaction => {
    const availabilityRef = input.decision === 'decline'
      ? firestore.collection('availability').doc(String(initialData.ownerId))
      : null;
    const freelancerProfileRef = availabilityRef && initialData.ownerType === 'freelancer'
      && (initialData.appointmentMode === undefined
        || initialData.appointmentMode === 'home' || initialData.appointmentMode === 'chair')
      ? firestore.collection('freelancerProfiles').doc(String(initialData.ownerId))
      : null;
    const snapshots = await transaction.getAll(
      bookingRef,
      privateRef,
      ...(principalRef ? [principalRef] : []),
      ...(staffMembershipRef ? [staffMembershipRef] : []),
      ...(freelancerProfileRef ? [freelancerProfileRef] : []),
      ...(availabilityRef ? [availabilityRef] : []),
    );
    const bookingSnapshot = snapshots[0];
    const privateSnapshot = snapshots[1];
    const principalSnapshot = principalRef ? snapshots[2] : undefined;
    const membershipSnapshot = staffMembershipRef ? snapshots[principalRef ? 3 : 2] : undefined;
    const availabilitySnapshot = availabilityRef ? snapshots[snapshots.length - 1] : undefined;
    const freelancerProfileSnapshot = freelancerProfileRef ? snapshots[snapshots.length - 2] : undefined;
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    if (
      booking.ownerType !== initialData.ownerType
      || booking.ownerId !== initialData.ownerId
      || booking.brandId !== initialData.brandId
      || booking.locationId !== initialData.locationId
      || booking.appointmentMode !== initialData.appointmentMode
    ) {
      throw new functions.https.HttpsError('failed-precondition', 'Booking owner scope changed during review');
    }
    const freelancerResponse = booking.ownerType === 'freelancer' && booking.ownerId === callerUid;
    const principal = principalSnapshot?.data() as RecordValue | undefined;
    const staffMembership = membershipSnapshot?.data() as RecordValue | undefined;
    const salonResponse = booking.ownerType === 'salon'
      && typeof booking.brandId === 'string'
      && typeof booking.ownerId === 'string'
      && booking.locationId === booking.ownerId
      && canManageSalonBookings(
        callerUid,
        booking.brandId,
        booking.ownerId,
        principal,
        staffMembership,
      );
    if (!freelancerResponse && !salonResponse) {
      throw new functions.https.HttpsError('permission-denied', 'Only the assigned professional can respond');
    }
    if (booking.status !== 'pending_approval') {
      throw new functions.https.HttpsError('failed-precondition', 'This booking is no longer awaiting approval');
    }
    const nextStatus = input.decision === 'accept' ? 'confirmed' : 'declined';
    transition('pending_approval', nextStatus);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, {
      status: nextStatus,
      addressReleased: nextStatus === 'confirmed',
      statusUpdatedAt: now,
      statusUpdatedBy: callerUid,
    });
    const availability = availabilitySnapshot?.data() as RecordValue | undefined;
    const slot = `${booking.date}T${booking.time}`;
    if (availabilityRef && availabilitySnapshot?.exists) {
      transaction.update(availabilityRef, releaseAvailability(
        availability, slot, booking, freelancerProfileSnapshot?.data() as RecordValue | undefined,
      ));
    }
    transaction.create(auditRef, {
      action: nextStatus === 'confirmed' ? 'MARKETPLACE_BOOKING_ACCEPTED' : 'MARKETPLACE_BOOKING_DECLINED',
      actorUid: callerUid, bookingId, createdAt: now,
    });
    response = bookingRecord(
      bookingId,
      { ...booking, status: nextStatus },
      freelancerResponse ? redactAddress(nextStatus, (privateSnapshot.data() as RecordValue | undefined)?.address as HomeAddress | undefined) : undefined,
    );
  });
  return response as Booking;
}

export async function cancelMarketplaceBooking(
  callerUid: string | null,
  bookingId: string,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<{ bookingId: string; status: 'cancelled' }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(bookingId)) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is invalid');
  }
  const bookingRef = firestore.collection('bookingRequests').doc(bookingId);
  const auditRef = firestore.collection('auditEvents').doc();
  await firestore.runTransaction(async transaction => {
    const bookingSnapshot = (await transaction.getAll(bookingRef))[0];
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    if (booking.clientId !== callerUid) throw new functions.https.HttpsError('permission-denied', 'Only the client can cancel this booking');
    if (booking.status !== 'pending_approval' && booking.status !== 'confirmed') {
      throw new functions.https.HttpsError('failed-precondition', 'This booking cannot be cancelled');
    }
    const cancellationDeadlineMs = cancellationDeadlineForBooking(booking);
    if (
      booking.ownerType === 'freelancer'
      && cancellationDeadlineMs !== undefined
      && currentTime.getTime() >= cancellationDeadlineMs
    ) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The cancellation window has closed for this home visit',
      );
    }
    transition(booking.status, 'cancelled');
    const availabilityRef = firestore.collection('availability').doc(String(booking.ownerId));
    const freelancerProfileRef = booking.ownerType === 'freelancer'
      && (booking.appointmentMode === undefined
        || booking.appointmentMode === 'home' || booking.appointmentMode === 'chair')
      ? firestore.collection('freelancerProfiles').doc(String(booking.ownerId))
      : null;
    const [availabilitySnapshot, freelancerProfileSnapshot] = await transaction.getAll(
      availabilityRef, ...(freelancerProfileRef ? [freelancerProfileRef] : []),
    );
    const availability = availabilitySnapshot.data() as RecordValue | undefined;
    const slot = `${booking.date}T${booking.time}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, { status: 'cancelled', statusUpdatedAt: now, statusUpdatedBy: callerUid });
    if (availabilitySnapshot.exists) {
      transaction.update(availabilityRef, releaseAvailability(
        availability, slot, booking, freelancerProfileSnapshot?.data() as RecordValue | undefined,
      ));
    }
    transaction.create(auditRef, { action: 'CLIENT_BOOKING_CANCELLED', actorUid: callerUid, bookingId, createdAt: now });
  });
  return { bookingId, status: 'cancelled' };
}

function singleBookingId(value: unknown): string {
  const input = storedRecord(value);
  if (!input || Object.keys(input).length !== 1) throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  return documentId(input.bookingId, 'bookingId');
}

export async function completeFreelancerBooking(
  callerUid: string | null, value: unknown, firestore: Firestore = admin.firestore(),
): Promise<{ bookingId: string; status: 'completed' }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const bookingId = singleBookingId(value);
  const reference = firestore.collection('bookingRequests').doc(bookingId);
  const auditRef = firestore.collection('auditEvents').doc();
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const booking = snapshot.data();
    if (!snapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    if (booking.ownerType !== 'freelancer' || booking.ownerId !== callerUid
      || booking.profileId !== `freelancer__${callerUid}`) {
      throw new functions.https.HttpsError('permission-denied', 'Only the assigned freelancer can complete this booking');
    }
    if (booking.status !== 'confirmed') throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed booking can be completed');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(reference, { status: 'completed', statusUpdatedAt: now, statusUpdatedBy: callerUid });
    transaction.create(auditRef, { action: 'FREELANCER_BOOKING_COMPLETED', actorUid: callerUid, bookingId, createdAt: now });
  });
  return { bookingId, status: 'completed' };
}

export async function getGuestFreelancerBooking(
  callerUid: string | null, value: unknown, firestore: Firestore = admin.firestore(), currentTime = new Date(),
) {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const bookingId = singleBookingId(value);
  return firestore.runTransaction(async transaction => {
    const [snapshot, review] = await transaction.getAll(
      firestore.collection('bookingRequests').doc(bookingId), firestore.collection('freelancerReviews').doc(bookingId),
    );
    const booking = snapshot.data();
    // Existence is private too. A reference alone never grants access.
    if (!snapshot.exists || booking?.clientId !== callerUid || booking.ownerType !== 'freelancer' || booking.guestBooking !== true) {
      throw new functions.https.HttpsError('not-found', 'Booking not found for this session');
    }
    if (!BOOKING_STATUSES.has(booking.status)) throw new functions.https.HttpsError('failed-precondition', 'Invalid booking status');
    const mode = booking.appointmentMode === 'chair' ? 'chair' : 'home';
    const deadline = cancellationDeadlineForBooking(booking);
    // Deliberate DTO: no contacts, client name, private address or request digest.
    return {
      booking: {
        id: bookingId, ownerId: booking.ownerId, ownerType: 'freelancer', profileId: booking.profileId,
        clientId: callerUid, serviceId: booking.serviceId, date: booking.date, time: booking.time,
        status: booking.status, appointmentMode: mode, guestBooking: true,
        servicePriceMinor: booking.servicePriceMinor, totalPriceMinor: booking.totalPriceMinor,
        durationMinutes: booking.durationMinutes, cancellationWindowHours: booking.cancellationWindowHours,
        ...(mode === 'chair' ? { workplaceSnapshot: commercialWorkplace(booking.workplaceSnapshot) }
          : { travelFeeMinor: booking.travelFeeMinor }),
      },
      canCancel: ['pending_approval', 'confirmed'].includes(booking.status)
        && (deadline === undefined || currentTime.getTime() < deadline),
      reviewState: review.exists ? 'reviewed' : booking.status === 'completed' ? 'eligible' : 'ineligible',
    };
  });
}

export async function getMarketplaceBookingAddress(
  callerUid: string | null,
  bookingId: string,
  firestore: Firestore = admin.firestore(),
): Promise<HomeAddress> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(bookingId)) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is invalid');
  }
  const [bookingSnapshot, privateSnapshot] = await Promise.all([
    firestore.collection('bookingRequests').doc(bookingId).get(),
    firestore.collection('bookingRequestPrivate').doc(bookingId).get(),
  ]);
  const booking = bookingSnapshot.data() as RecordValue | undefined;
  if (!bookingSnapshot.exists || !booking || booking.status !== 'confirmed' || booking.appointmentMode === 'chair') {
    throw new functions.https.HttpsError('failed-precondition', 'Address is not available before acceptance');
  }
  if (booking.clientId !== callerUid && !(booking.ownerType === 'freelancer' && booking.ownerId === callerUid)) {
    throw new functions.https.HttpsError('permission-denied', 'You are not authorized to view this address');
  }
  const address = (privateSnapshot.data() as RecordValue | undefined)?.address;
  if (!privateSnapshot.exists || !address) throw new functions.https.HttpsError('not-found', 'Booking address not found');
  return parseHomeAddress(address) as HomeAddress;
}

export const requestBookingFunction = europeFunctions.https.onCall(async (data, context) => (
  createMarketplaceBooking(context.auth?.uid ?? null, data)
));

export const publicFreelancerBookingCallableOptions = {
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  maxInstances: 2,
};

export const requestPublicFreelancerBookingFunction = europeFunctions
  .runWith(publicFreelancerBookingCallableOptions).https.onCall((data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    if (!context.app) throw new functions.https.HttpsError('failed-precondition', 'Firebase App Check is required');
    if (context.app.alreadyConsumed) {
      throw new functions.https.HttpsError('failed-precondition', 'This App Check token was already consumed');
    }
    return createPublicFreelancerBooking(context.auth.uid, data);
  });

export const respondToBookingFunction = europeFunctions.https.onCall(async (data, context) => (
  respondToMarketplaceBooking(context.auth?.uid ?? null, data)
));

export const completeFreelancerBookingFunction = europeFunctions.https.onCall((data, context) => (
  completeFreelancerBooking(context.auth?.uid ?? null, data)
));
export const getGuestFreelancerBookingFunction = europeFunctions.runWith({ enforceAppCheck: true, maxInstances: 2 }).https.onCall((data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!context.app) throw new functions.https.HttpsError('failed-precondition', 'Firebase App Check is required');
  return getGuestFreelancerBooking(context.auth.uid, data);
});

export const cancelBookingFunction = europeFunctions.runWith(publicFreelancerBookingCallableOptions).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!context.app) throw new functions.https.HttpsError('failed-precondition', 'Firebase App Check is required');
  if (context.app.alreadyConsumed) {
    throw new functions.https.HttpsError('failed-precondition', 'This App Check token was already consumed');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  }
  return cancelMarketplaceBooking(context.auth.uid, (data as RecordValue).bookingId as string);
});

export const getBookingAddressFunction = europeFunctions.https.onCall(async (data, context) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  }
  return getMarketplaceBookingAddress(context.auth?.uid ?? null, (data as RecordValue).bookingId as string);
});

export const saveSalonAvailabilityFunction = europeFunctions.https.onCall((data, context) => (
  saveSalonAvailability(context.auth?.uid ?? null, data)
));

export const listSalonBookingWorkspaceFunction = europeFunctions.https.onCall((data, context) => (
  listSalonBookingWorkspace(context.auth?.uid ?? null, data)
));
