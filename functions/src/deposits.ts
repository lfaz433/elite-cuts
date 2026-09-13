import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;

function bookingIdFrom(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  }
  const input = value as RecordValue;
  if (
    Object.keys(input).length !== 1
    || typeof input.bookingId !== 'string'
    || !/^[A-Za-z0-9_-]{1,256}$/.test(input.bookingId)
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is invalid');
  }
  return input.bookingId;
}

async function bookingCountryCode(
  booking: RecordValue,
  firestore: Firestore,
): Promise<string | null> {
  if (typeof booking.countryCode === 'string' && /^[A-Z]{2}$/.test(booking.countryCode)) {
    return booking.countryCode;
  }
  if (typeof booking.ownerId !== 'string') return null;
  const collectionName = booking.ownerType === 'freelancer'
    ? 'freelancerProfiles'
    : booking.ownerType === 'salon'
      ? 'salonLocations'
      : null;
  if (!collectionName) return null;
  const owner = await firestore.collection(collectionName).doc(booking.ownerId).get();
  const countryCode = owner.data()?.countryCode;
  return owner.exists && typeof countryCode === 'string' && /^[A-Z]{2}$/.test(countryCode)
    ? countryCode
    : null;
}

/**
 * Deliberately non-actionable until a separately approved payment phase.
 * This guard never creates a deposit, returns a checkout URL, or calls a provider.
 */
export async function createConfirmedDeposit(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
): Promise<never> {
  if (!callerUid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const bookingId = bookingIdFrom(value);
  const bookingSnapshot = await firestore.collection('bookingRequests').doc(bookingId).get();
  const booking = bookingSnapshot.data() as RecordValue | undefined;
  if (!bookingSnapshot.exists || !booking) {
    throw new functions.https.HttpsError('not-found', 'Booking not found');
  }
  if (booking.status !== 'confirmed') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'A deposit is available only after booking confirmation',
    );
  }
  if (booking.clientId !== callerUid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the booking client can request a deposit',
    );
  }
  const countryCode = await bookingCountryCode(booking, firestore);
  if (!countryCode) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Online deposits are not available for this booking',
    );
  }
  const capability = await firestore.collection('paymentCapabilities').doc(countryCode).get();
  if (!capability.exists || capability.data()?.onlineDeposits !== true) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Online deposits are not available in this country',
    );
  }
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Online deposit collection is not configured',
  );
}

export const createConfirmedDepositFunction = functions.https.onCall((data, context) => (
  createConfirmedDeposit(context.auth?.uid ?? null, data)
));
