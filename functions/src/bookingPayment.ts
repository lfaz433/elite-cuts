import * as admin from 'firebase-admin';
import { Membership } from './authz';

export interface BookingPaymentInput {
  amountMinor: number;
  tipMinor: number;
  method: 'cash';
  evidence: { type: 'staff_cash_attestation' };
}

const allowedKeys = new Set(['amountMinor', 'tipMinor', 'method', 'evidence']);

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
      || membership?.brandId !== booking?.tenantId
      || membership?.locationId !== expectedLocationId
      || membership?.status !== 'active'
      || membership?.permissions?.manageBookings !== true
    ) {
      throw new Error('Payment authorization changed');
    }
    if (booking?.status !== 'completed') throw new Error('Booking is not completed');
    if (booking?.paymentStatus === 'paid') throw new Error('Booking payment is already recorded');
    if (!Number.isSafeInteger(booking?.expectedAmountMinor)) {
      throw new Error('Booking has no trusted expected amount');
    }
    if (payment.amountMinor !== booking.expectedAmountMinor) {
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
