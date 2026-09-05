import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import {
  parseSalonBookingWorkspace,
  type BookingStatus,
  type MarketplaceBooking,
  type SalonBookingWorkspace,
} from './bookingRecords';

export type { BookingStatus, MarketplaceBooking, SalonBookingWorkspace } from './bookingRecords';
export interface HomeAddress { line1: string; city: string; postalCode?: string; }
export interface ApproximateLocation { latitude: number; longitude: number; }
export interface BookingRequestInput {
  profileId: string; serviceId: string; date: string; time: string; clientName: string;
  clientEmail?: string; clientPhone?: string; approximateArea?: string;
  approximateLocation?: ApproximateLocation; homeAddress?: HomeAddress;
}
function isBookingResult(value: unknown): value is { bookingId: string; status: 'confirmed' | 'pending_approval' } {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).bookingId === 'string'
    && ((value as Record<string, unknown>).status === 'confirmed' || (value as Record<string, unknown>).status === 'pending_approval');
}
const requestBookingCall = httpsCallable<BookingRequestInput, unknown>(functions, 'requestBooking');
const respondToBookingCall = httpsCallable<{ bookingId: string; decision: 'accept' | 'decline' }, unknown>(functions, 'respondToBooking');
const cancelBookingCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'cancelBooking');
const getBookingAddressCall = httpsCallable<{ bookingId: string }, unknown>(functions, 'getBookingAddress');
const saveSalonAvailabilityCall = httpsCallable<{
  locationId: string; availableSlots: string[];
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
export async function respondToBooking(input: { bookingId: string; decision: 'accept' | 'decline' }): Promise<MarketplaceBooking> {
  const result = await respondToBookingCall(input);
  if (!result.data || typeof result.data !== 'object') throw new Error('The booking service returned an invalid response');
  return result.data as MarketplaceBooking;
}
export async function cancelBooking(bookingId: string): Promise<void> {
  const result = await cancelBookingCall({ bookingId });
  if (!result.data || typeof result.data !== 'object' || (result.data as Record<string, unknown>).status !== 'cancelled') throw new Error('The booking service returned an invalid response');
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
  availableSlots: string[],
): Promise<string[]> {
  const result = await saveSalonAvailabilityCall({ locationId, availableSlots });
  const data = result.data as Record<string, unknown> | null;
  if (
    !data
    || data.locationId !== locationId
    || !Array.isArray(data.availableSlots)
    || data.availableSlots.some(slot => typeof slot !== 'string')
  ) throw new Error('The salon availability service returned an invalid response');
  return data.availableSlots as string[];
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
