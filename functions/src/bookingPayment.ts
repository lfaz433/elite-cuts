import * as admin from 'firebase-admin';
import type { Membership } from './authz';
import type { PushRecipientAssociation } from './pushRecipient';

export interface BookingPaymentInput {
  amountMinor: number;
  tipMinor: number;
  method: 'cash';
  evidence: { type: 'staff_cash_attestation' };
}

const allowedKeys = new Set(['amountMinor', 'tipMinor', 'method', 'evidence']);

function priceMinor(value: unknown): number {
  const normalized = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
  const minor = Math.round(normalized * 100);
  if (!Number.isFinite(normalized) || normalized < 0 || !Number.isSafeInteger(minor)) {
    throw new Error('Service price is invalid');
  }
  return minor;
}

async function trustedExpectedAmount(
  transaction: admin.firestore.Transaction,
  firestore: admin.firestore.Firestore,
  booking: admin.firestore.DocumentData,
  expectedLocationId: string,
): Promise<{ amountMinor: number; backfilled: boolean }> {
  if (Number.isSafeInteger(booking.expectedAmountMinor) && booking.expectedAmountMinor >= 0) {
    return { amountMinor: booking.expectedAmountMinor, backfilled: false };
  }
  if (typeof booking.serviceId !== 'string' || !booking.serviceId) {
    throw new Error('Booking has no trusted expected amount');
  }
  const serviceRef = firestore.collection('services').doc(booking.serviceId);
  const [serviceSnapshot] = await transaction.getAll(serviceRef);
  const service = serviceSnapshot.data();
  const serviceLocationId = service?.locationId ?? service?.tenantId;
  if (!serviceSnapshot.exists || serviceLocationId !== expectedLocationId) {
    throw new Error('Booking has no trusted expected amount');
  }
  return { amountMinor: priceMinor(service?.price), backfilled: true };
}

function membershipBrandMatchesBooking(
  membership: admin.firestore.DocumentData | undefined,
  booking: admin.firestore.DocumentData,
): boolean {
  return typeof booking.brandId !== 'string' || membership?.brandId === booking.brandId;
}

export function parseBookingPaymentInput(value: unknown): BookingPaymentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payment data is required');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new Error('Server-owned payment fields cannot be supplied');
  }
  if (
    typeof input.amountMinor !== 'number'
    || !Number.isSafeInteger(input.amountMinor)
    || input.amountMinor < 0
    || input.amountMinor > 100_000_000
  ) {
    throw new Error('amountMinor is invalid');
  }
  const tipMinor = input.tipMinor ?? 0;
  if (typeof tipMinor !== 'number' || !Number.isSafeInteger(tipMinor) || tipMinor < 0 || tipMinor > 100_000_000) {
    throw new Error('tipMinor is invalid');
  }
  if (input.method === 'card') {
    throw new Error('Card payments require verified processor evidence');
  }
  if (input.method !== 'cash') {
    throw new Error('method is invalid');
  }
  const evidence = input.evidence as Record<string, unknown> | undefined;
  if (!evidence || Object.keys(evidence).length !== 1 || evidence.type !== 'staff_cash_attestation') {
    throw new Error('Cash payment evidence is required');
  }
  return {
    amountMinor: input.amountMinor,
    tipMinor,
    method: input.method,
    evidence: { type: 'staff_cash_attestation' },
  };
}

export async function recordBookingPayment(
  callerUid: string,
  bookingId: string,
  expectedLocationId: string,
  authorizedMembership: Membership,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<void> {
  const payment = parseBookingPaymentInput(value);
  const bookingRef = firestore.collection('bookings').doc(bookingId);
  const membershipRef = firestore.collection('memberships').doc(authorizedMembership.id);
  const auditRef = firestore.collection('audit_logs').doc();

  await firestore.runTransaction(async transaction => {
    const [bookingSnapshot, membershipSnapshot] = await transaction.getAll(
      bookingRef,
      membershipRef,
    );
    if (!bookingSnapshot.exists) throw new Error('Booking not found');
    const booking = bookingSnapshot.data();
    const locationId = booking?.locationId ?? booking?.tenantId;
    if (locationId !== expectedLocationId) throw new Error('Booking scope changed');

    const membership = membershipSnapshot.data();
    if (
      !membershipSnapshot.exists
      || membership?.userId !== callerUid
      || !membershipBrandMatchesBooking(membership, booking ?? {})
      || membership?.locationId !== expectedLocationId
      || membership?.status !== 'active'
      || membership?.permissions?.manageBookings !== true
    ) {
      throw new Error('Payment authorization changed');
    }
    if (booking?.status !== 'completed') throw new Error('Booking is not completed');
    if (booking?.paymentStatus === 'paid') throw new Error('Booking payment is already recorded');
    const expected = await trustedExpectedAmount(
      transaction,
      firestore,
      booking ?? {},
      expectedLocationId,
    );
    if (payment.amountMinor !== expected.amountMinor) {
      throw new Error('Payment amount does not match booking amount');
    }

    const recordedAt = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, {
      paymentStatus: 'paid',
      pricePaidMinor: payment.amountMinor,
      tipMinor: payment.tipMinor,
      pricePaid: payment.amountMinor / 100,
      tip: payment.tipMinor / 100,
      paymentMethod: payment.method,
      paymentRecordedAt: recordedAt,
      paymentRecordedBy: callerUid,
      ...(expected.backfilled ? { expectedAmountMinor: expected.amountMinor } : {}),
    });
    transaction.create(auditRef, {
      action: 'BOOKING_PAYMENT_RECORDED',
      actorUid: callerUid,
      tenantId: booking?.tenantId,
      locationId: expectedLocationId,
      bookingId,
      before: {
        paymentStatus: booking?.paymentStatus ?? 'unpaid',
        pricePaid: booking?.pricePaid ?? 0,
        tip: booking?.tip ?? 0,
        paymentMethod: booking?.paymentMethod ?? null,
      },
      after: {
        paymentStatus: 'paid',
        pricePaidMinor: payment.amountMinor,
        tipMinor: payment.tipMinor,
        paymentMethod: payment.method,
        evidenceType: payment.evidence.type,
      },
      createdAt: recordedAt,
    });
  });
}

export async function completeBookingAndRecordPayment(
  callerUid: string,
  bookingId: string,
  expectedLocationId: string,
  authorizedMembership: Membership,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
  recipientAssociation: PushRecipientAssociation | null = null,
): Promise<{ notificationIds: string[] }> {
  const payment = parseBookingPaymentInput(value);
  const bookingRef = firestore.collection('bookings').doc(bookingId);
  const membershipRef = firestore.collection('memberships').doc(authorizedMembership.id);
  const auditRef = firestore.collection('audit_logs').doc();
  const notificationRef = recipientAssociation
    ? firestore.collection('notifications').doc()
    : null;

  const notificationId = await firestore.runTransaction(async transaction => {
    const [bookingSnapshot, membershipSnapshot] = await transaction.getAll(
      bookingRef,
      membershipRef,
    );
    if (!bookingSnapshot.exists) throw new Error('Booking not found');
    const booking = bookingSnapshot.data();
    const locationId = booking?.locationId ?? booking?.tenantId;
    if (locationId !== expectedLocationId) throw new Error('Booking scope changed');

    const membership = membershipSnapshot.data();
    if (
      !membershipSnapshot.exists
      || membership?.userId !== callerUid
      || !membershipBrandMatchesBooking(membership, booking ?? {})
      || membership?.locationId !== expectedLocationId
      || membership?.status !== 'active'
      || membership?.permissions?.manageBookings !== true
    ) {
      throw new Error('Payment authorization changed');
    }
    if (booking?.status !== 'approved' && booking?.status !== 'confirmed') {
      throw new Error('Booking is not confirmed');
    }
    if (booking?.paymentStatus === 'paid') throw new Error('Booking payment is already recorded');
    const expected = await trustedExpectedAmount(
      transaction,
      firestore,
      booking ?? {},
      expectedLocationId,
    );
    if (payment.amountMinor !== expected.amountMinor) {
      throw new Error('Payment amount does not match booking amount');
    }

    const recordedAt = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, {
      status: 'completed',
      completedAt: recordedAt,
      statusUpdatedAt: recordedAt,
      statusUpdatedBy: callerUid,
      paymentStatus: 'paid',
      pricePaidMinor: payment.amountMinor,
      tipMinor: payment.tipMinor,
      pricePaid: payment.amountMinor / 100,
      tip: payment.tipMinor / 100,
      paymentMethod: payment.method,
      paymentRecordedAt: recordedAt,
      paymentRecordedBy: callerUid,
      ...(expected.backfilled ? { expectedAmountMinor: expected.amountMinor } : {}),
    });
    transaction.create(auditRef, {
      action: 'BOOKING_COMPLETED_AND_PAID',
      actorUid: callerUid,
      tenantId: booking?.tenantId,
      locationId: expectedLocationId,
      bookingId,
      before: {
        status: booking?.status,
        paymentStatus: booking?.paymentStatus ?? 'unpaid',
      },
      after: {
        status: 'completed',
        paymentStatus: 'paid',
        pricePaidMinor: payment.amountMinor,
        tipMinor: payment.tipMinor,
        paymentMethod: payment.method,
        evidenceType: payment.evidence.type,
      },
      createdAt: recordedAt,
    });
    if (
      !notificationRef
      || !recipientAssociation
      || booking?.barberId !== recipientAssociation.sourceAlias
    ) {
      return null;
    }
    transaction.create(notificationRef, {
      type: 'COMPLETED',
      title: 'Service enregistré',
      message: 'Un service terminé a été ajouté à votre activité.',
      redirectUrl: '/barber/gains',
      serverIssued: true,
      tenantId: booking?.tenantId,
      locationId: expectedLocationId,
      recipientId: recipientAssociation.userId,
      ...(recipientAssociation.membershipId
        ? { recipientMembershipId: recipientAssociation.membershipId }
        : {}),
      reservationId: bookingId,
      read: false,
      createdAt: recordedAt,
    });
    return notificationRef.id;
  });
  return { notificationIds: notificationId ? [notificationId] : [] };
}
