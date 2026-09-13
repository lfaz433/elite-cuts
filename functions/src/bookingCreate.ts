import * as admin from 'firebase-admin';
import { BookingPaymentInput, parseBookingPaymentInput } from './bookingPayment';

export interface BookingCreateInput {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  type: 'avec-rdv' | 'sans-rdv';
  notes?: string;
}

export type StaffBookingCreateAction =
  | { status: 'approved' }
  | { status: 'completed'; payment: BookingPaymentInput };

type StoredRecord = Record<string, any>;
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const inactiveStatuses = new Set(['rejected', 'declined', 'cancelled', 'archived']);

const allowedKeys = new Set([
  'clientName',
  'clientEmail',
  'clientPhone',
  'serviceId',
  'barberId',
  'date',
  'time',
  'type',
  'notes',
]);

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, field, maxLength);
}

export function parseBookingCreateInput(value: unknown): BookingCreateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Booking data is required');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new Error('Server-owned booking fields cannot be supplied by the client');
  }

  const date = text(input.date, 'date', 10);
  const time = text(input.time, 'time', 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Booking date or time is invalid');
  }
  const bookingType = input.type ?? 'avec-rdv';
  if (bookingType !== 'avec-rdv' && bookingType !== 'sans-rdv') {
    throw new Error('type is invalid');
  }
  return {
    clientName: text(input.clientName, 'clientName', 120),
    clientEmail: optionalText(input.clientEmail, 'clientEmail', 254) ?? '',
    clientPhone: optionalText(input.clientPhone, 'clientPhone', 40) ?? '',
    serviceId: text(input.serviceId, 'serviceId', 128),
    barberId: text(input.barberId, 'barberId', 128),
    date,
    time,
    type: bookingType,
    ...(optionalText(input.notes, 'notes', 1000) ? { notes: optionalText(input.notes, 'notes', 1000) } : {}),
  };
}

function parseStaffBookingCreateAction(value: unknown): StaffBookingCreateAction | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Staff booking action is invalid');
  }
  const input = value as Record<string, unknown>;
  if (input.status === 'approved' && Object.keys(input).length === 1) {
    return { status: 'approved' };
  }
  if (
    input.status === 'completed'
    && Object.keys(input).length === 2
    && Object.prototype.hasOwnProperty.call(input, 'payment')
  ) {
    return { status: 'completed', payment: parseBookingPaymentInput(input.payment) };
  }
  throw new Error('Staff booking action is invalid');
}

function minutes(value: unknown, field: string): number {
  if (typeof value !== 'string') throw new Error(`${field} is invalid`);
  const normalized = value.replace('+1', '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) throw new Error(`${field} is invalid`);
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute + (value.includes('+1') ? 1440 : 0);
}

function serviceDuration(value: unknown): number {
  const duration = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 720) {
    throw new Error('Service duration is invalid');
  }
  return duration;
}

function servicePriceMinor(value: unknown): number {
  const normalized = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
  const minor = Math.round(normalized * 100);
  if (!Number.isFinite(normalized) || normalized < 0 || !Number.isSafeInteger(minor)) {
    throw new Error('Service price is invalid');
  }
  return minor;
}

export function initialClientBookingStatus(
  tenant: StoredRecord,
  businessInfo: StoredRecord = {},
): 'pending' | 'approved' {
  const policy = businessInfo.bookingPolicy ?? tenant.bookingPolicy ?? tenant.settings?.bookingPolicy;
  return policy === 'automatic' ? 'approved' : 'pending';
}

function locationTimezone(tenant: StoredRecord, businessInfo: StoredRecord): string {
  const value = businessInfo.timezone ?? tenant.timezone ?? tenant.settings?.timezone;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Location time zone is not configured');
  }
  const timezone = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error('Location time zone is invalid');
  }
  return timezone;
}

interface WallTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallTimeParts(date: Date, timezone: string): WallTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return values as unknown as WallTimeParts;
}

function appointmentDate(input: BookingCreateInput, timezone: string): Date {
  const [year, month, day] = input.date.split('-').map(Number);
  const [hour, minute] = input.time.split(':').map(Number);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(wallTimeAsUtc);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
  ) {
    throw new Error('Booking date or time is invalid');
  }

  const offsets = new Set<number>();
  for (const delta of [-86_400_000, 0, 86_400_000]) {
    const probe = new Date(wallTimeAsUtc + delta);
    const parts = wallTimeParts(probe, timezone);
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - probe.getTime());
  }
  const candidates = [...offsets]
    .map(offset => new Date(wallTimeAsUtc - offset))
    .filter(candidate => {
      const parts = wallTimeParts(candidate, timezone);
      return parts.year === year
        && parts.month === month
        && parts.day === day
        && parts.hour === hour
        && parts.minute === minute;
    });
  if (candidates.length !== 1) {
    throw new Error('Booking date or time is invalid');
  }
  return candidates[0];
}

export function validateBookingSlot(
  input: BookingCreateInput,
  tenant: StoredRecord,
  service: StoredRecord,
  barber: StoredRecord,
  businessInfo: StoredRecord,
  now: Date = new Date(),
  isStaff = false,
): { durationMinutes: number; expectedAmountMinor: number } {
  const startsAt = appointmentDate(input, locationTimezone(tenant, businessInfo));
  if (input.type === 'sans-rdv' && !isStaff) {
    throw new Error('Walk-in booking requires staff authorization');
  }
  const leadMinutes = Number.isInteger(tenant.settings?.minBookingLeadMinutes)
    ? tenant.settings.minBookingLeadMinutes
    : 30;
  if (input.type !== 'sans-rdv' && startsAt.getTime() <= now.getTime() + leadMinutes * 60_000) {
    throw new Error('Booking must be in the future');
  }
  if (tenant.settings?.allowOnlineBooking === false && !isStaff) {
    throw new Error('Online booking is disabled');
  }
  const maxAdvanceDays = tenant.settings?.maxBookingAdvanceDays;
  if (Number.isInteger(maxAdvanceDays) && startsAt.getTime() > now.getTime() + maxAdvanceDays * 86_400_000) {
    throw new Error('Booking exceeds the advance booking policy');
  }

  const durationMinutes = serviceDuration(service.duration);
  if (service.archived === true || service.active === false || service.status === 'inactive') {
    throw new Error('Service is unavailable');
  }
  const [year, month, date] = input.date.split('-').map(Number);
  const day = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const locationHours = businessInfo.weeklyHours?.[dayNames[day]];
  if (!locationHours || locationHours.isOpen !== true) throw new Error('Location is closed');
  const locationOpen = minutes(locationHours.open, 'Location opening time');
  const locationClose = minutes(locationHours.close, 'Location closing time');
  let startMinute = minutes(input.time, 'Booking time');
  if (locationClose >= 1440 && startMinute < locationOpen) startMinute += 1440;
  if (startMinute < locationOpen || startMinute + durationMinutes > locationClose) {
    throw new Error('Booking is outside location hours');
  }

  if (barber.archived === true || barber.status === 'offline' || barber.status === 'break') {
    throw new Error('Barber is unavailable');
  }
  const workingDays = Array.isArray(barber.workingDays) ? barber.workingDays : [1, 2, 3, 4, 5, 6];
  if (!workingDays.includes(day)) throw new Error('Barber is unavailable');
  if (barber.mainServiceId && barber.mainServiceId !== input.serviceId && barber.secondaryServiceId !== input.serviceId) {
    throw new Error('Barber does not provide this service');
  }
  const shiftStart = minutes(barber.shiftStart ?? locationHours.open, 'Barber shift start');
  const shiftEnd = minutes(barber.shiftEnd ?? locationHours.close, 'Barber shift end');
  let shiftSlotStart = startMinute;
  if (shiftEnd >= 1440 && shiftSlotStart < shiftStart) shiftSlotStart += 1440;
  if (shiftSlotStart < shiftStart || shiftSlotStart + durationMinutes > shiftEnd) {
    throw new Error('Barber is unavailable');
  }

  return { durationMinutes, expectedAmountMinor: servicePriceMinor(service.price) };
}

export function assertNoBookingOverlap(
  input: BookingCreateInput,
  durationMinutes: number,
  existingBookings: StoredRecord[],
): void {
  const start = minutes(input.time, 'time');
  const end = start + durationMinutes;
  const hasOverlap = existingBookings.some(existing => {
    if (
      existing.barberId !== input.barberId
      || existing.date !== input.date
      || inactiveStatuses.has(existing.status)
    ) return false;
    const existingStart = minutes(existing.time, 'Existing booking time');
    const existingDuration = Number.isInteger(existing.durationMinutes) && existing.durationMinutes > 0
      ? existing.durationMinutes
      : 30;
    return start < existingStart + existingDuration && end > existingStart;
  });
  if (hasOverlap) throw new Error('Booking slot is no longer available');
}

export async function createBooking(
  tenantId: string,
  callerUid: string | null,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
  staffActionValue?: unknown,
): Promise<{ bookingId: string; status: 'pending' | 'approved' | 'completed' }> {
  if (!callerUid) throw new Error('Authentication is required');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new Error('tenantId is invalid');
  const input = parseBookingCreateInput(value);
  const staffAction = parseStaffBookingCreateAction(staffActionValue);
  if (input.type === 'sans-rdv' && staffAction?.status !== 'completed') {
    throw new Error('Walk-in booking must be completed and paid atomically');
  }
  if (staffAction?.status === 'completed' && input.type !== 'sans-rdv') {
    throw new Error('Only a walk-in can be completed during creation');
  }
  let staffMembershipRef: admin.firestore.DocumentReference | null = null;
  if (staffAction) {
    const staffMembership = await firestore.collection('memberships')
      .where('userId', '==', callerUid)
      .where('locationId', '==', tenantId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (staffMembership.empty || staffMembership.docs[0].data().permissions?.manageBookings !== true) {
      throw new Error('Staff booking permission is required');
    }
    staffMembershipRef = staffMembership.docs[0].ref
      ?? firestore.collection('memberships').doc(staffMembership.docs[0].id);
  }
  const clientId = staffAction ? null : callerUid;
  const bookingRef = firestore.collection('bookings').doc();
  const tenantRef = firestore.collection('tenants').doc(tenantId);
  const serviceRef = firestore.collection('services').doc(input.serviceId);
  const barberRef = input.barberId === 'any'
    ? null
    : firestore.collection('barbers').doc(input.barberId);
  if (!barberRef) throw new Error('A specific barber is required');
  const businessInfoRef = tenantRef.collection('businessInfo').doc('info');
  const slotLockRef = firestore.collection('booking_slot_locks')
    .doc(`${tenantId}__${input.barberId}__${input.date}`);
  const auditRef = staffAction ? firestore.collection('audit_logs').doc() : null;
  let createdStatus: 'pending' | 'approved' | 'completed' = staffAction?.status ?? 'pending';

  await firestore.runTransaction(async transaction => {
    const [tenant, service, barber, businessInfo] = await transaction.getAll(
      tenantRef, serviceRef, barberRef, businessInfoRef, slotLockRef,
    );
    if (!tenant.exists) throw new Error('Tenant not found');
    const tenantData = tenant.data() ?? {};
    const authorityBrandId = typeof tenantData.brandId === 'string' && tenantData.brandId
      ? tenantData.brandId
      : tenantId;
    if (!service.exists || service.data()?.tenantId !== tenantId) {
      throw new Error('Service does not belong to this tenant');
    }
    if (!barber.exists || barber.data()?.tenantId !== tenantId) {
      throw new Error('Barber does not belong to this tenant');
    }
    if (!businessInfo.exists) throw new Error('Location hours are not configured');
    const staffMembershipSnapshot = staffMembershipRef
      ? (await transaction.getAll(staffMembershipRef))[0]
      : null;
    const staffMembership = staffMembershipSnapshot?.data();
    if (staffAction && (
      !staffMembershipSnapshot?.exists
      || staffMembership?.userId !== callerUid
      || staffMembership?.brandId !== authorityBrandId
      || staffMembership?.locationId !== tenantId
      || staffMembership?.status !== 'active'
      || staffMembership?.permissions?.manageBookings !== true
    )) {
      throw new Error('Staff booking authorization changed');
    }

    const slot = validateBookingSlot(
      input,
      tenantData,
      service.data() ?? {},
      barber.data() ?? {},
      businessInfo.data() ?? {},
      new Date(),
      staffAction !== null,
    );
    if (staffAction?.status === 'completed' && staffAction.payment.amountMinor !== slot.expectedAmountMinor) {
      throw new Error('Payment amount does not match booking amount');
    }
    const overlapQuery = firestore.collection('bookings')
      .where('tenantId', '==', tenantId)
      .where('barberId', '==', input.barberId)
      .where('date', '==', input.date);
    const existing = await transaction.get(overlapQuery);
    assertNoBookingOverlap(input, slot.durationMinutes, existing.docs.map(document => document.data()));

    transaction.set(slotLockRef, {
      tenantId,
      barberId: input.barberId,
      date: input.date,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const status = staffAction?.status ?? initialClientBookingStatus(
      tenantData,
      businessInfo.data() ?? {},
    );
    createdStatus = status;
    transaction.create(bookingRef, {
      ...input,
      brandId: authorityBrandId,
      tenantId,
      locationId: tenantId,
      clientId,
      isTest: false,
      status,
      paymentStatus: staffAction?.status === 'completed' ? 'paid' : 'unpaid',
      pricePaid: staffAction?.status === 'completed' ? staffAction.payment.amountMinor / 100 : 0,
      tip: staffAction?.status === 'completed' ? staffAction.payment.tipMinor / 100 : 0,
      expectedAmountMinor: slot.expectedAmountMinor,
      durationMinutes: slot.durationMinutes,
      unreadAdmin: true,
      unreadBarber: true,
      ...(staffAction?.status === 'completed' ? {
        completedAt: createdAt,
        pricePaidMinor: staffAction.payment.amountMinor,
        tipMinor: staffAction.payment.tipMinor,
        paymentMethod: staffAction.payment.method,
        paymentRecordedAt: createdAt,
        paymentRecordedBy: callerUid,
      } : {}),
      ...(staffAction ? { statusUpdatedAt: createdAt, statusUpdatedBy: callerUid } : {}),
      createdAt,
    });
    if (auditRef && staffAction) {
      transaction.create(auditRef, {
        action: staffAction.status === 'completed'
          ? 'WALK_IN_BOOKING_COMPLETED_AND_PAID'
          : 'STAFF_BOOKING_CREATED_APPROVED',
        actorUid: callerUid,
        brandId: authorityBrandId,
        tenantId,
        locationId: tenantId,
        bookingId: bookingRef.id,
        after: {
          status,
          paymentStatus: staffAction.status === 'completed' ? 'paid' : 'unpaid',
        },
        createdAt,
      });
    }
  });

  return { bookingId: bookingRef.id, status: createdStatus };
}
