import { Calendar } from 'lucide-react';
import { BookingStatusCard } from '../booking/BookingStatusCard';
import type { MarketplaceBooking } from '../../lib/marketplace/bookings';
export function UpcomingBookings({ bookings, onCancelled }: { bookings: MarketplaceBooking[]; onCancelled?: (bookingId: string) => void }) {
  if (bookings.length === 0) return <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/55"><Calendar className="mx-auto mb-3 h-9 w-9 text-[#D4AF37]/60" />Aucune réservation à venir.</div>;
  return <div className="space-y-3">{bookings.map(booking => <BookingStatusCard key={`${booking.source}:${booking.id}`} booking={booking} onCancelled={onCancelled} />)}</div>;
}
