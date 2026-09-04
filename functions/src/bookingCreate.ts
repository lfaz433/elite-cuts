import * as admin from 'firebase-admin';

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

export async function createBooking(
  tenantId: string,
  callerUid: string | null,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<{ bookingId: string; status: 'pending' }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new Error('tenantId is invalid');
  const input = parseBookingCreateInput(value);
  let clientId = callerUid;
  if (callerUid) {
    const staffMembership = await firestore.collection('memberships')
      .where('userId', '==', callerUid)
      .where('locationId', '==', tenantId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!staffMembership.empty && staffMembership.docs[0].data().permissions?.manageBookings === true) {
      clientId = null;
    }
  }
  const bookingRef = firestore.collection('bookings').doc();
  const tenantRef = firestore.collection('tenants').doc(tenantId);
  const serviceRef = firestore.collection('services').doc(input.serviceId);
  const barberRef = input.barberId === 'any'
    ? null
    : firestore.collection('barbers').doc(input.barberId);

  await firestore.runTransaction(async transaction => {
    const references = barberRef ? [tenantRef, serviceRef, barberRef] : [tenantRef, serviceRef];
    const snapshots = await transaction.getAll(...references);
    const [tenant, service, barber] = snapshots;
    if (!tenant.exists) throw new Error('Tenant not found');
    if (!service.exists || service.data()?.tenantId !== tenantId) {
      throw new Error('Service does not belong to this tenant');
    }
    if (barberRef && (!barber?.exists || barber.data()?.tenantId !== tenantId)) {
      throw new Error('Barber does not belong to this tenant');
    }

    transaction.create(bookingRef, {
      ...input,
      tenantId,
      locationId: tenantId,
      clientId,
      status: 'pending',
      paymentStatus: 'unpaid',
      pricePaid: 0,
      tip: 0,
      unreadAdmin: true,
      unreadBarber: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { bookingId: bookingRef.id, status: 'pending' };
}
