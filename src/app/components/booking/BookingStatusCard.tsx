import { Calendar, Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { bookingStatusLabel, cancelBooking, getBookingAddress, type HomeAddress, type MarketplaceBooking } from '../../lib/marketplace/bookings';
export function BookingStatusCard({ booking, onCancelled }: { booking: MarketplaceBooking; onCancelled?: (bookingId: string) => void }) {
  const canCancel = booking.source === 'marketplace'
    && (booking.status === 'pending_approval' || booking.status === 'confirmed');
  const [address, setAddress] = useState<HomeAddress | null>(null);
  useEffect(() => {
    if (booking.source !== 'marketplace' || booking.ownerType !== 'freelancer' || booking.status !== 'confirmed') { setAddress(null); return; }
    let current = true;
    void getBookingAddress(booking.id).then(value => { if (current) setAddress(value); }).catch(() => { if (current) setAddress(null); });
    return () => { current = false; };
  }, [booking.id, booking.ownerType, booking.source, booking.status]);
  const cancel = async () => { try { await cancelBooking(booking.id); onCancelled?.(booking.id); toast.success('Votre réservation a été annulée.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Impossible d’annuler cette réservation.'); } };
  return <article className="rounded-2xl border border-[#D4AF37]/20 bg-[#141414] p-5 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#D4AF37]">{booking.ownerType === 'freelancer' ? 'À domicile' : 'En salon'}</p><h3 className="mt-2 font-bold">{booking.serviceId}</h3><p className="mt-1 text-sm text-white/55">{bookingStatusLabel(booking.status)}</p></div>{canCancel && <button onClick={() => void cancel()} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:border-red-400 hover:text-red-300"><X className="h-3.5 w-3.5" /> Annuler</button>}</div><div className="mt-4 flex gap-4 text-sm text-white/60"><span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4 text-[#D4AF37]" />{booking.date}</span><span className="inline-flex items-center gap-1"><Clock className="h-4 w-4 text-[#D4AF37]" />{booking.time}</span></div>{typeof booking.totalPriceMinor === 'number' && <p className="mt-3 text-sm text-white/70">Total : {(booking.totalPriceMinor / 100).toFixed(2)} €{typeof booking.travelFeeMinor === 'number' ? `, dont ${(booking.travelFeeMinor / 100).toFixed(2)} € de déplacement` : ''}</p>}{typeof booking.cancellationWindowHours === 'number' && <p className="mt-1 text-xs text-white/45">Annulation possible jusqu’à {booking.cancellationWindowHours} h avant le rendez-vous.</p>}{booking.source === 'legacy' && <p className="mt-2 text-xs text-white/40">Réservation historique du salon</p>}{address && <p className="mt-3 text-sm text-white/60">Adresse confirmée : {address.line1}, {address.city}{address.postalCode ? ` ${address.postalCode}` : ''}</p>}</article>;
}
