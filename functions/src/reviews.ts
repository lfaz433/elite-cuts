import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { europeFunctions } from './runtime';

export type PublicFreelancerReview = {
  rating: number;
  text?: string;
  authorName: string;
  createdAtMs: number;
};
export type FreelancerReviewSummary = {
  average: number | null;
  count: number;
  reviews: PublicFreelancerReview[];
};
export type FreelancerInboxReview = PublicFreelancerReview & {
  reviewId: string;
  bookingId: string;
  status: 'approved' | 'hidden' | 'pending' | 'rejected';
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function requireCaller(uid: string): void {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
}

function minimizedAuthorName(value: unknown): string {
  if (typeof value !== 'string') return 'Client';
  const words = value.trim().split(/\s+/);
  // Names come from the booking, never the review payload. Do not publish
  // emails, telephone numbers or full surnames from that private snapshot.
  if (!words.length || !words.every(word => /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*$/u.test(word))
    || words[0].length > 60) return 'Client';
  return words.length === 1 ? words[0] : `${words[0]} ${Array.from(words[words.length - 1])[0]}.`;
}

function parseReviewInput(value: unknown): { bookingId: string; rating: number; text?: string } {
  const input = record(value);
  if (!input || Object.keys(input).some(key => !['bookingId', 'rating', 'text'].includes(key))
    || typeof input.bookingId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(input.bookingId)
    || typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5
    || (input.text !== undefined && (typeof input.text !== 'string' || input.text.length > 500))) {
    throw new functions.https.HttpsError('invalid-argument', 'A bookingId, rating from 1 to 5 and optional text up to 500 characters are required');
  }
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  return { bookingId: input.bookingId, rating: input.rating, ...(text ? { text } : {}) };
}

export async function submitFreelancerReview(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<{ reviewId: string; status: 'approved' }> {
  requireCaller(callerUid);
  const input = parseReviewInput(value);
  const bookingRef = firestore.collection('bookingRequests').doc(input.bookingId);
  const reviewRef = firestore.collection('freelancerReviews').doc(input.bookingId);
  await firestore.runTransaction(async transaction => {
    const bookingSnapshot = await transaction.get(bookingRef);
    const booking = record(bookingSnapshot.data());
    if (!bookingSnapshot.exists || !booking) throw new functions.https.HttpsError('not-found', 'Booking not found');
    if (booking.clientId !== callerUid) throw new functions.https.HttpsError('permission-denied', 'Only the booking client can submit a review');
    if (booking.ownerType !== 'freelancer' || booking.status !== 'completed'
      || typeof booking.ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(booking.ownerId)) {
      throw new functions.https.HttpsError('failed-precondition', 'A completed freelancer booking is required');
    }
    const existing = await transaction.get(reviewRef);
    if (existing.exists) throw new functions.https.HttpsError('already-exists', 'This booking already has a review');
    transaction.create(reviewRef, {
      freelancerId: booking.ownerId,
      bookingId: input.bookingId,
      rating: input.rating,
      ...(input.text ? { text: input.text } : {}),
      authorName: minimizedAuthorName(booking.clientName),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'approved',
    });
  });
  return { reviewId: input.bookingId, status: 'approved' };
}

function safeStoredReview(value: unknown, freelancerId: string, now: number): (PublicFreelancerReview & {
  bookingId: string; status: FreelancerInboxReview['status']; createdAtOrderMs: number;
}) | null {
  const review = record(value);
  if (!review || review.freelancerId !== freelancerId || typeof review.bookingId !== 'string'
    || !/^[A-Za-z0-9_-]{1,256}$/.test(review.bookingId)
    || typeof review.rating !== 'number' || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5
    || !['approved', 'hidden', 'pending', 'rejected'].includes(String(review.status))
    || (review.text !== undefined && (typeof review.text !== 'string' || review.text.length > 500))) return null;
  const timestamp = review.createdAt as { toMillis?: () => number } | undefined;
  let milliseconds: unknown;
  try { milliseconds = timestamp?.toMillis?.(); } catch { return null; }
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > now) return null;
  const createdAtMs = Math.floor(milliseconds);
  if (!Number.isSafeInteger(createdAtMs)) return null;
  return {
    bookingId: review.bookingId, status: review.status as FreelancerInboxReview['status'],
    rating: review.rating, authorName: minimizedAuthorName(review.authorName), createdAtMs, createdAtOrderMs: milliseconds,
    ...(typeof review.text === 'string' && review.text.trim() ? { text: review.text.trim() } : {}),
  };
}

export function buildApprovedReviewSummary(
  freelancerId: string,
  values: unknown[],
  now = Date.now(),
): FreelancerReviewSummary {
  const approved = values.map(value => safeStoredReview(value, freelancerId, now))
    .filter((review): review is NonNullable<typeof review> => review !== null && review.status === 'approved')
    .sort((left, right) => right.createdAtOrderMs - left.createdAtOrderMs || left.bookingId.localeCompare(right.bookingId));
  return {
    average: approved.length ? approved.reduce((total, review) => total + review.rating, 0) / approved.length : null,
    count: approved.length,
    reviews: approved.slice(0, 5).map(({ rating, text, authorName, createdAtMs }) => ({
      rating, authorName, createdAtMs, ...(text ? { text } : {}),
    })),
  };
}

export async function listMyFreelancerReviews(
  callerUid: string,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<FreelancerInboxReview[]> {
  requireCaller(callerUid);
  const profile = await firestore.collection('freelancerProfiles').doc(callerUid).get();
  if (!profile.exists) throw new functions.https.HttpsError('permission-denied', 'A freelancer profile is required');
  const snapshot = await firestore.collection('freelancerReviews').where('freelancerId', '==', callerUid).get();
  const now = Date.now();
  return snapshot.docs.flatMap(document => {
    const review = safeStoredReview(document.data(), callerUid, now);
    return review && review.bookingId === document.id ? [{ reviewId: document.id, ...review }] : [];
  }).sort((left, right) => right.createdAtOrderMs - left.createdAtOrderMs || left.reviewId.localeCompare(right.reviewId))
    .map(({ createdAtOrderMs: _order, ...review }) => review);
}

export const submitFreelancerReviewFunction = europeFunctions.runWith({
  enforceAppCheck: true, consumeAppCheckToken: true, maxInstances: 2,
}).https.onCall(async (data, context) => {
  requireCaller(context.auth?.uid ?? '');
  if (!context.app) throw new functions.https.HttpsError('failed-precondition', 'Firebase App Check is required');
  if (context.app.alreadyConsumed) {
    throw new functions.https.HttpsError('failed-precondition', 'This App Check token was already consumed');
  }
  return submitFreelancerReview(context.auth!.uid, data);
});

export const listMyFreelancerReviewsFunction = europeFunctions.https.onCall(async (data, context) => {
  requireCaller(context.auth?.uid ?? '');
  if (!record(data) || Object.keys(data).length !== 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No owner selector is accepted');
  }
  return listMyFreelancerReviews(context.auth!.uid);
});
