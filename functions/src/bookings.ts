import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

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

export interface ApproximateLocation {
  latitude: number;
  longitude: number;
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
  approximateLocation?: ApproximateLocation;
  homeAddress?: HomeAddress;
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
    throw new functions.https.HttpsError('invalid-argument', 'availableSlots is invalid');
  }
  const slots = value.map(slot => requireText(slot, 'availableSlots', 16));
  if (
    slots.some(slot => !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(slot))
    || new Set(slots).size !== slots.length
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'availableSlots is invalid');
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

function parseApproximateLocation(value: unknown): ApproximateLocation | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'approximateLocation is invalid');
  }
  const location = value as RecordValue;
  if (
    Object.keys(location).some(key => !['latitude', 'longitude'].includes(key))
    || typeof location.latitude !== 'number'
    || !Number.isFinite(location.latitude)
    || location.latitude < -90
    || location.latitude > 90
    || typeof location.longitude !== 'number'
    || !Number.isFinite(location.longitude)
    || location.longitude < -180
    || location.longitude > 180
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'approximateLocation is invalid');
  }
  return { latitude: location.latitude, longitude: location.longitude };
}

export function parseMarketplaceBookingInput(value: unknown): MarketplaceBookingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Booking data is required');
  }
  const input = value as RecordValue;
  const allowed = new Set([
    'profileId', 'serviceId', 'date', 'time', 'clientName', 'clientEmail', 'clientPhone',
    'approximateArea', 'approximateLocation', 'homeAddress',
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
    ...(parseApproximateLocation(input.approximateLocation)
      ? { approximateLocation: parseApproximateLocation(input.approximateLocation) }
      : {}),
    ...(parseHomeAddress(input.homeAddress) ? { homeAddress: parseHomeAddress(input.homeAddress) } : {}),
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

function configuredAvailabilitySlots(value: RecordValue | undefined): string[] {
  const slots = value?.configuredSlots;
  return Array.isArray(slots) ? slots.filter((slot): slot is string => typeof slot === 'string') : [];
}

function reserveAvailability(value: RecordValue, slot: string) {
  return {
    availableSlots: availabilitySlots(value, 'availableSlots').filter(candidate => candidate !== slot),
    reservedSlots: [...new Set([...availabilitySlots(value, 'reservedSlots'), slot])].sort(),
  };
}

function releaseAvailability(value: RecordValue | undefined, slot: string) {
  const configuredSlots = configuredAvailabilitySlots(value);
  const shouldRestore = configuredSlots.length === 0 || configuredSlots.includes(slot);
  return {
    availableSlots: shouldRestore
      ? [...new Set([...availabilitySlots(value, 'availableSlots'), slot])].sort()
      : availabilitySlots(value, 'availableSlots'),
    reservedSlots: availabilitySlots(value, 'reservedSlots').filter(candidate => candidate !== slot),
  };
}

export async function saveSalonAvailability(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ locationId: string; availableSlots: string[] }> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Salon availability is required');
  }
  const input = value as RecordValue;
  if (Object.keys(input).some(key => !['locationId', 'availableSlots'].includes(key))) {
    throw new functions.https.HttpsError('invalid-argument', 'Salon availability is invalid');
  }
  const locationId = documentId(input.locationId, 'locationId');
  const configuredSlots = slotList(input.availableSlots);
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
  return { locationId, availableSlots };
}

export async function listSalonBookingWorkspace(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<{ locationId: string; availableSlots: string[]; bookings: Array<RecordValue & { id: string }> }> {
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

function distanceKm(left: ApproximateLocation, right: ApproximateLocation): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const firstLatitude = radians(left.latitude);
  const secondLatitude = radians(right.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function freelancerBookingPolicy(owner: RecordValue, serviceId: string) {
  const publicProfile = owner.publicProfile as RecordValue | undefined;
  const servicePrices = owner.servicePricesMinor as RecordValue | undefined;
  const radiusKm = owner.radiusKm;
  const travelFeeMinor = owner.travelFeeMinor;
  const cancellationWindowHours = owner.cancellationWindowHours;
  const servicePriceMinor = servicePrices?.[serviceId];
  if (
    !Number.isInteger(radiusKm) || (radiusKm as number) < 1 || (radiusKm as number) > 100
    || !Number.isInteger(travelFeeMinor) || (travelFeeMinor as number) < 0
    || !Number.isInteger(cancellationWindowHours)
    || (cancellationWindowHours as number) < 0
    || (cancellationWindowHours as number) > 720
    || !Number.isInteger(servicePriceMinor) || (servicePriceMinor as number) < 0
    || typeof publicProfile?.latitude !== 'number'
    || typeof publicProfile.longitude !== 'number'
  ) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This professional has incomplete booking policy settings',
    );
  }
  return {
    radiusKm: radiusKm as number,
    travelFeeMinor: travelFeeMinor as number,
    cancellationWindowHours: cancellationWindowHours as number,
    servicePriceMinor: servicePriceMinor as number,
    origin: {
      latitude: publicProfile.latitude as number,
      longitude: publicProfile.longitude as number,
    },
  };
}

function appointmentEpochMs(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00.000Z`);
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
    if (owner.type === 'freelancer' && !input.approximateLocation) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'An approximate location is required for a home visit',
      );
    }
    if (owner.type === 'salon' && (input.homeAddress || input.approximateLocation)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'A salon booking cannot include a home address or location',
      );
    }
    status = initialBookingStatus({ type: owner.type, bookingPolicy: ownerPolicy(ownerSnapshot.data()) });
    transaction.update(
      availabilityRef,
      reserveAvailability(availabilitySnapshot.data() as RecordValue, slot),
    );
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ownerData = ownerSnapshot.data() as RecordValue;
    let homeVisitPolicy: RecordValue | undefined;
    if (owner.type === 'freelancer') {
      const policy = freelancerBookingPolicy(ownerData, input.serviceId);
      const distance = distanceKm(policy.origin, input.approximateLocation as ApproximateLocation);
      if (distance > policy.radiusKm) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'The requested address is outside this professional’s service radius',
        );
      }
      homeVisitPolicy = {
        servicePriceMinor: policy.servicePriceMinor,
        travelFeeMinor: policy.travelFeeMinor,
        totalPriceMinor: policy.servicePriceMinor + policy.travelFeeMinor,
        serviceRadiusKm: policy.radiusKm,
        distanceKm: Math.round(distance * 10) / 10,
        cancellationWindowHours: policy.cancellationWindowHours,
        cancellationDeadlineMs: appointmentEpochMs(input.date, input.time)
          - policy.cancellationWindowHours * 60 * 60 * 1000,
      };
    }
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
      ...(homeVisitPolicy ?? {}),
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
    const snapshots = await transaction.getAll(
      bookingRef,
      privateRef,
      ...(principalRef ? [principalRef] : []),
      ...(staffMembershipRef ? [staffMembershipRef] : []),
      ...(availabilityRef ? [availabilityRef] : []),
    );
    const bookingSnapshot = snapshots[0];
    const privateSnapshot = snapshots[1];
    const principalSnapshot = principalRef ? snapshots[2] : undefined;
    const membershipSnapshot = staffMembershipRef ? snapshots[principalRef ? 3 : 2] : undefined;
    const availabilitySnapshot = availabilityRef ? snapshots[snapshots.length - 1] : undefined;
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    if (
      booking.ownerType !== initialData.ownerType
      || booking.ownerId !== initialData.ownerId
      || booking.brandId !== initialData.brandId
      || booking.locationId !== initialData.locationId
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
      transaction.update(availabilityRef, releaseAvailability(availability, slot));
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
    if (
      booking.ownerType === 'freelancer'
      && typeof booking.cancellationDeadlineMs === 'number'
      && currentTime.getTime() >= booking.cancellationDeadlineMs
    ) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The cancellation window has closed for this home visit',
      );
    }
    transition(booking.status, 'cancelled');
    const availabilityRef = firestore.collection('availability').doc(String(booking.ownerId));
    const availabilitySnapshot = (await transaction.getAll(availabilityRef))[0];
    const availability = availabilitySnapshot.data() as RecordValue | undefined;
    const slot = `${booking.date}T${booking.time}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, { status: 'cancelled', statusUpdatedAt: now, statusUpdatedBy: callerUid });
    if (availabilitySnapshot.exists) {
      transaction.update(availabilityRef, releaseAvailability(availability, slot));
    }
    transaction.create(auditRef, { action: 'CLIENT_BOOKING_CANCELLED', actorUid: callerUid, bookingId, createdAt: now });
  });
  return { bookingId, status: 'cancelled' };
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
  if (!bookingSnapshot.exists || !booking || booking.status !== 'confirmed') {
    throw new functions.https.HttpsError('failed-precondition', 'Address is not available before acceptance');
  }
  if (booking.clientId !== callerUid && !(booking.ownerType === 'freelancer' && booking.ownerId === callerUid)) {
    throw new functions.https.HttpsError('permission-denied', 'You are not authorized to view this address');
  }
  const address = (privateSnapshot.data() as RecordValue | undefined)?.address;
  if (!privateSnapshot.exists || !address) throw new functions.https.HttpsError('not-found', 'Booking address not found');
  return parseHomeAddress(address) as HomeAddress;
}

export const requestBookingFunction = functions.https.onCall(async (data, context) => (
  createMarketplaceBooking(context.auth?.uid ?? null, data)
));

export const respondToBookingFunction = functions.https.onCall(async (data, context) => (
  respondToMarketplaceBooking(context.auth?.uid ?? null, data)
));

export const cancelBookingFunction = functions.https.onCall(async (data, context) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  }
  return cancelMarketplaceBooking(context.auth?.uid ?? null, (data as RecordValue).bookingId as string);
});

export const getBookingAddressFunction = functions.https.onCall(async (data, context) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  }
  return getMarketplaceBookingAddress(context.auth?.uid ?? null, (data as RecordValue).bookingId as string);
});

export const saveSalonAvailabilityFunction = functions.https.onCall((data, context) => (
  saveSalonAvailability(context.auth?.uid ?? null, data)
));

export const listSalonBookingWorkspaceFunction = functions.https.onCall((data, context) => (
  listSalonBookingWorkspace(context.auth?.uid ?? null, data)
));
