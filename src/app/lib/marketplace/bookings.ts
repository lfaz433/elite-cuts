import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { ensureGuestBookingSession, existingGuestBookingSession } from './guestBookingSession';
import {
  parseSalonBookingWorkspace,
  parseMarketplaceBooking,
  type BookingStatus,
  type MarketplaceBooking,
  type SalonBookingWorkspace,
} from './bookingRecords';

export type { BookingStatus, MarketplaceBooking, SalonBookingWorkspace } from './bookingRecords';
export interface HomeAddress { line1: string; city: string; postalCode?: string; }
export interface BookingRequestInput {
  profileId: string; serviceId: string; date: string; time: string; clientName: string;
  clientEmail?: string; clientPhone?: string; approximateArea?: string;
  homeAddress?: HomeAddress;
}
export interface PublicFreelancerBookingInput {
  publicSlug: string;
  serviceId: string;
  appointmentMode: 'home' | 'chair';
  date: string;
  time: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  approximateArea?: string;
  homeAddress?: HomeAddress;
  clientRequestId: string;
}
export interface PublicFreelancerBookingResult { bookingId: string; status: BookingStatus; }
function isBookingResult(value: unknown): value is { bookingId: string; status: 'confirmed' | 'pending_approval' } {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).bookingId === 'string'
    && ((value as Record<string, unknown>).status === 'confirmed' || (value as Record<string, unknown>).status === 'pending_approval');
}
const requestBookingCall = httpsCallable<BookingRequestInput, unknown>(functions, 'requestBooking');
const requestPublicFreelancerBookingCall = httpsCallable<PublicFreelancerBookingInput, unknown>(
  functions, 'requestPublicFreelancerBooking', { limitedUseAppCheckTokens: true },
);
const respondToBookingCall = httpsCallable<{ bookingId: string; decision: 'accept' | 'decline' }, unknown>(functions, 'respondToBooking');
const cancelBookingCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'cancelBooking');
const completeFreelancerBookingCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'completeFreelancerBooking');
const getGuestFreelancerBookingCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'getGuestFreelancerBooking');
const getBookingAddressCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'getBookingAddress');
const saveSalonAvailabilityCall = httpsCallable<{
  locationId: string; configuredSlots: string[];
}, unknown>(functions, 'saveSalonAvailability');
const listSalonBookingWorkspaceCall = httpsCallable<{ locationId: string }, unknown>(
  functions,
  'listSalonBookingWorkspace',
);
export async function requestBooking(input: BookingRequestInput): Promise<{ bookingId: string; status: 'confirmed' | 'pending_approval' }> {
  const result = await requestBookingCall(input);
  if (!isBookingResult(result.data)) throw new Error('The booking service returned an invalid response');
  return result.data;
}
export async function requestPublicFreelancerBooking(input: PublicFreelancerBookingInput): Promise<PublicFreelancerBookingResult> {
  await ensureGuestBookingSession();
  const result = await requestPublicFreelancerBookingCall(input);
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The booking service returned an invalid response');
  }
  const record = data as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || typeof record.bookingId !== 'string'
    || !/^[A-Za-z0-9_-]{1,256}$/.test(record.bookingId)
    || (record.status !== 'pending_approval' && record.status !== 'confirmed' && record.status !== 'declined'
      && record.status !== 'cancelled' && record.status !== 'completed' && record.status !== 'payment_failed')) {
    throw new Error('The booking service returned an invalid response');
  }
  return { bookingId: record.bookingId, status: record.status };
}
export async function respondToBooking(input: { bookingId: string; decision: 'accept' | 'decline' }): Promise<MarketplaceBooking> {
  const result = await respondToBookingCall(input);
  if (!result.data || typeof result.data !== 'object') throw new Error('The booking service returned an invalid response');
  return result.data as MarketplaceBooking;
}
export async function cancelBooking(bookingId: string): Promise<void> {
  const result = await cancelBookingCall({ bookingId });
  if (!result.data || typeof result.data !== 'object' || (result.data as Record<string, unknown>).status !== 'cancelled') throw new Error('The booking service returned an invalid response');
}
export async function completeFreelancerBooking(bookingId: string): Promise<void> {
  const result = await completeFreelancerBookingCall({ bookingId });
  const data = result.data as Record<string, unknown> | null;
  if (!data || data.bookingId !== bookingId || data.status !== 'completed') throw new Error('Invalid completion response');
}

export type GuestBookingFollowUp = {
  booking: MarketplaceBooking;
  canCancel: boolean;
  reviewState: 'ineligible' | 'eligible' | 'reviewed';
};
export async function getGuestFreelancerBooking(bookingId: string): Promise<GuestBookingFollowUp> {
  const uid = await existingGuestBookingSession();
  if (!uid) throw new Error('The original booking session is unavailable');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(bookingId)) throw new Error('Invalid booking reference');
  const result = await getGuestFreelancerBookingCall({ bookingId });
  const closed = (value: unknown, keys: string[]): Record<string, unknown> | null => value && typeof value === 'object'
    && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key)) ? value as Record<string, unknown> : null;
  const data = closed(result.data, ['booking', 'canCancel', 'reviewState']);
  const raw = closed(data?.booking, ['id', 'ownerId', 'ownerType', 'profileId', 'clientId', 'serviceId', 'date', 'time',
    'status', 'appointmentMode', 'guestBooking', 'servicePriceMinor', 'totalPriceMinor', 'travelFeeMinor',
    'durationMinutes', 'cancellationWindowHours', 'workplaceSnapshot']);
  const booking = raw && parseMarketplaceBooking(bookingId, uid, { ...raw, clientName: '' });
  if (!data || !raw || !booking || raw.id !== bookingId || booking.ownerType !== 'freelancer' || !booking.guestBooking
    || booking.profileId !== `freelancer__${booking.ownerId}` || typeof data.canCancel !== 'boolean'
    || !['ineligible', 'eligible', 'reviewed'].includes(String(data.reviewState))
    || (data.reviewState === 'eligible' && booking.status !== 'completed')
    || (data.canCancel && !['pending_approval', 'confirmed'].includes(booking.status))
    || (raw.workplaceSnapshot !== undefined && !closed(raw.workplaceSnapshot, ['name', 'line1', 'postalCode', 'city']))
    || await existingGuestBookingSession() !== uid) throw new Error('Invalid guest booking response');
  return { booking, canCancel: data.canCancel, reviewState: data.reviewState as GuestBookingFollowUp['reviewState'] };
}
export async function getBookingAddress(bookingId: string): Promise<HomeAddress> {
  const result = await getBookingAddressCall({ bookingId });
  const address = result.data as Partial<HomeAddress> | null;
  if (!address || typeof address.line1 !== 'string' || typeof address.city !== 'string' || (address.postalCode !== undefined && typeof address.postalCode !== 'string')) {
    throw new Error('The booking service returned an invalid address response');
  }
  return { line1: address.line1, city: address.city, ...(address.postalCode ? { postalCode: address.postalCode } : {}) };
}
export async function saveSalonAvailability(
  locationId: string,
  configuredSlots: string[],
): Promise<{ configuredSlots: string[]; availableSlots: string[] }> {
  const result = await saveSalonAvailabilityCall({ locationId, configuredSlots });
  const data = result.data as Record<string, unknown> | null;
  if (
    !data
    || data.locationId !== locationId
    || !Array.isArray(data.configuredSlots)
    || data.configuredSlots.some(slot => typeof slot !== 'string')
    || !Array.isArray(data.availableSlots)
    || data.availableSlots.some(slot => typeof slot !== 'string')
  ) throw new Error('The salon availability service returned an invalid response');
  return {
    configuredSlots: data.configuredSlots as string[],
    availableSlots: data.availableSlots as string[],
  };
}
export async function listSalonBookingWorkspace(locationId: string): Promise<SalonBookingWorkspace> {
  const result = await listSalonBookingWorkspaceCall({ locationId });
  const workspace = parseSalonBookingWorkspace(result.data, locationId);
  if (!workspace) throw new Error('The salon booking service returned an invalid response');
  return workspace;
}
export function bookingStatusLabel(status: BookingStatus): string {
  return { pending_approval: 'En attente de confirmation', confirmed: 'Confirmé', declined: 'Refusé', cancelled: 'Annulé', completed: 'Terminé', payment_failed: 'Paiement à régulariser' }[status];
}
