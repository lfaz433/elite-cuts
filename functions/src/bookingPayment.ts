import * as admin from 'firebase-admin';
import { Membership } from './authz';

export interface BookingPaymentInput {
  amount: number;
  tip: number;
  method: 'cash' | 'card';
}

const allowedKeys = new Set(['amount', 'tip', 'method']);

export function parseBookingPaymentInput(value: unknown): BookingPaymentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payment data is required');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new Error('Server-owned payment fields cannot be supplied');
  }
  if (
    typeof input.amount !== 'number'
    || !Number.isFinite(input.amount)
    || input.amount < 0
    || input.amount > 1_000_000
  ) {
    throw new Error('amount is invalid');
  }
  const tip = input.tip ?? 0;
  if (typeof tip !== 'number' || !Number.isFinite(tip) || tip < 0 || tip > 1_000_000) {
    throw new Error('tip is invalid');
  }
  if (input.method !== 'cash' && input.method !== 'card') {
    throw new Error('method is invalid');
  }
  return { amount: input.amount, tip, method: input.method };
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

    const recordedAt = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(bookingRef, {
      paymentStatus: 'paid',
      pricePaid: payment.amount,
      tip: payment.tip,
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
        pricePaid: payment.amount,
        tip: payment.tip,
        paymentMethod: payment.method,
      },
      createdAt: recordedAt,
    });
  });
}
