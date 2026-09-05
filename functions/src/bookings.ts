import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireMembership } from './authz';

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

function ownerPolicy(value: unknown): 'automatic' | 'manual' {
  const owner = value as RecordValue | undefined;
  return owner?.bookingPolicy === 'automatic' || owner?.settings && (owner.settings as RecordValue).bookingPolicy === 'automatic'
    ? 'automatic'
    : 'manual';
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
    if (owner.type === 'freelancer' && !input.homeAddress) {
      throw new functions.https.HttpsError('invalid-argument', 'A home address is required for a home visit');
    }
    if (owner.type === 'salon' && input.homeAddress) {
      throw new functions.https.HttpsError('invalid-argument', 'A salon booking cannot include a home address');
    }
    status = initialBookingStatus({ type: owner.type, bookingPolicy: ownerPolicy(ownerSnapshot.data()) });
    const updatedSlots = (availabilitySnapshot.data() as RecordValue).availableSlots as string[];
    transaction.update(availabilityRef, { availableSlots: updatedSlots.filter(candidate => candidate !== slot) });
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
  let staffMembershipRef: admin.firestore.DocumentReference | null = null;
  if (initialData.ownerType === 'salon') {
    const membership = await requireMembership(callerUid, String(initialData.ownerId), 'manageBookings');
    staffMembershipRef = firestore.collection('memberships').doc(membership.id);
  }
  let response: Booking | undefined;

  await firestore.runTransaction(async transaction => {
    const snapshots = await transaction.getAll(bookingRef, privateRef, ...(staffMembershipRef ? [staffMembershipRef] : []));
    const [bookingSnapshot, privateSnapshot, membershipSnapshot] = snapshots;
    const booking = bookingSnapshot.data() as RecordValue | undefined;
    if (!bookingSnapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const freelancerResponse = booking.ownerType === 'freelancer' && booking.ownerId === callerUid;
    const staffMembership = membershipSnapshot?.data() as RecordValue | undefined;
    const salonResponse = booking.ownerType === 'salon'
      && typeof booking.brandId === 'string'
      && staffMembership?.userId === callerUid
      && staffMembership.brandId === booking.brandId
      && staffMembership.locationId === booking.ownerId
      && staffMembership.status === 'active'
      && (staffMembership.permissions as RecordValue | undefined)?.manageBookings === true;
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
    if (nextStatus === 'declined') {
      const availabilityRef = firestore.collection('availability').doc(String(booking.ownerId));
      const availabilitySnapshot = (await transaction.getAll(availabilityRef))[0];
      const availability = availabilitySnapshot.data() as RecordValue | undefined;
      const slot = `${booking.date}T${booking.time}`;
      if (availabilitySnapshot.exists && Array.isArray(availability?.availableSlots)) {
        transaction.update(availabilityRef, { availableSlots: [...availability.availableSlots, slot] });
      }
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
    transition(booking.status, 'cancelled');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, { status: 'cancelled', statusUpdatedAt: now, statusUpdatedBy: callerUid });
    const availabilityRef = firestore.collection('availability').doc(String(booking.ownerId));
    const availabilitySnapshot = (await transaction.getAll(availabilityRef))[0];
    const availability = availabilitySnapshot.data() as RecordValue | undefined;
    const slot = `${booking.date}T${booking.time}`;
    if (availabilitySnapshot.exists && Array.isArray(availability?.availableSlots) && !availability.availableSlots.includes(slot)) {
      transaction.update(availabilityRef, { availableSlots: [...availability.availableSlots, slot] });
    }
    transaction.create(auditRef, { action: 'CLIENT_BOOKING_CANCELLED', actorUid: callerUid, bookingId, createdAt: now });
  });
  return { bookingId, status: 'cancelled' };
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
